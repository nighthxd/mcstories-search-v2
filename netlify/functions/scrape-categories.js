// netlify/functions/scrape-categories.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { tags, searchall } = require('../../categories');
const { scrapeWebsite } = require('./utils/sharedScraperUtils');
const { Pool } = require('pg');

let pool;

// THIS IS THE MISSING FUNCTION
async function ensureDbInitialized() {
    if (!pool) {
        if (!process.env.NETLIFY_DATABASE_URL) {
            throw new Error('NETLIFY_DATABASE_URL environment variable is not set.');
        }

        pool = new Pool({
            connectionString: process.env.NETLIFY_DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });

        try {
            const client = await pool.connect();
            await client.query(`
                CREATE TABLE IF NOT EXISTS stories (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    url TEXT UNIQUE NOT NULL,
                    categories TEXT[],
                    synopsis TEXT,
                    last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('Database table "stories" ensured to exist.');
            client.release();
        } catch (err) {
            console.error('Failed to connect to DB or create "stories" table:', err);
            pool = null;
            throw new Error('Database initialization for stories failed...');
        }
    }
    return pool;
}

exports.handler = async (event, context) => {
    let includedTags = [];
    let excludedTags = [];
    let searchQuery = '';

    if (event.queryStringParameters) {
        if (event.queryStringParameters.categories) {
            includedTags = event.queryStringParameters.categories.split(',');
        }
        if (event.queryStringParameters.excludedCategories) {
            excludedTags = event.queryStringParameters.excludedCategories.split(',');
        }
        if (event.queryStringParameters.query) {
            searchQuery = event.queryStringParameters.query;
        }
    }

    let client;
    let browser = null;

    try {
        const pool = await ensureDbInitialized(); // This line was causing the error
        client = await pool.connect();

        const cachedStoriesResult = await client.query(
            `SELECT title, url, categories, synopsis FROM stories
             WHERE categories @> $1
             AND ($2 = '' OR title ILIKE '%' || $2 || '%')
             AND NOT (categories && $3)
             AND last_scraped_at > NOW() - INTERVAL '1 hour'`,
            [includedTags, searchQuery, excludedTags]
        );

        if (cachedStoriesResult.rows.length > 0) {
            console.log(`Returning ${cachedStoriesResult.rows.length} stories from cache.`);
            return {
                statusCode: 200,
                body: JSON.stringify(cachedStoriesResult.rows),
            };
        }
        
        console.log(`No fresh cache. Launching browser...`);
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        let urlsToScrape = [];
        if (includedTags.length > 0) {
            includedTags.forEach(tag => {
                if (tags[tag]) urlsToScrape.push(tags[tag]);
            });
        } else {
            urlsToScrape.push(...searchall);
        }

        console.log(`Scraping ${urlsToScrape.length} URLs in parallel.`);
        const scrapePromises = urlsToScrape.map(url => scrapeWebsite(browser, url));
        const results = await Promise.all(scrapePromises);
        const allStories = results.flat();
        
        const uniqueStories = [];
        const seenTitles = new Set();
        for (const story of allStories) {
            if (!seenTitles.has(story.title)) {
                seenTitles.add(story.title);
                uniqueStories.push(story);

                try {
                    await client.query(
                        `INSERT INTO stories (title, url, categories, synopsis)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (url) DO UPDATE SET
                             title = EXCLUDED.title,
                             categories = EXCLUDED.categories,
                             synopsis = EXCLUDED.synopsis,
                             last_scraped_at = CURRENT_TIMESTAMP`,
                        [story.title, story.link, story.categories, story.synopsis]
                    );
                } catch (dbError) {
                    console.error(`Error saving story "${story.title}" to DB:`, dbError.message);
                }
            }
        }
        
        const finalUniqueStories = uniqueStories.filter(story => {
            const matchesSearchQuery = searchQuery === '' || story.title.toLowerCase().includes(searchQuery.toLowerCase());
            const passesExcludedFilter = excludedTags.length === 0 || !excludedTags.some(tag => story.categories.includes(tag));
            return matchesSearchQuery && passesExcludedFilter;
        });

        return {
            statusCode: 200,
            body: JSON.stringify(finalUniqueStories),
        };
    } catch (error) {
        console.error("Error in scrape-categories function handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error occurred while scraping or processing' }),
        };
    } finally {
        if (browser !== null) {
            await browser.close();
            console.log("Browser closed successfully.");
        }
        if (client) {
            client.release();
        }
    }
};