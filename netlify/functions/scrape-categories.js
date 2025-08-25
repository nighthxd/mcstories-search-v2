// netlify/functions/scrape-categories.js
const axios = require('axios');
const cheerio = require('cheerio');
const { tags, searchall } = require('../../categories');
const { scrapeWebsite } = require('./utils/sharedScraperUtils');
const { Pool } = require('pg');

let pool;

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
    // Allows CORS for local development
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: '',
        };
    }

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

    try {
        const pool = await ensureDbInitialized();
        client = await pool.connect();

        // 1. Check cache for specific tags and query
        const cachedStoriesResult = await client.query(
            `SELECT title, url, categories, synopsis FROM stories
             WHERE categories @> $1
             AND ($2 = '' OR title ILIKE '%' || $2 || '%')
             AND NOT (categories && $3)
             AND last_scraped_at > NOW() - INTERVAL '1 hour'`, // Removed LIMIT 100
            [includedTags, searchQuery, excludedTags]
        );

        if (cachedStoriesResult.rows.length > 0) {
            console.log(`Cache query for tags: ${includedTags.join(',')} query: ${searchQuery} exclude: ${excludedTags.join(',')}`);
            console.log(`Database rows found for cache: ${cachedStoriesResult.rows.length}`);
            console.log(`Returning ${cachedStoriesResult.rows.length} stories from cache for tags: "${includedTags.join(',')}" and query: "${searchQuery}"`);
            return {
                statusCode: 200,
                body: JSON.stringify(cachedStoriesResult.rows),
            };
        }

        console.log(`No fresh cache for tags: ${includedTags.join(',')} and query: "${searchQuery}". Initiating scrape.`);

        let urlsToScrape = [];
        if (includedTags.length > 0) {
            includedTags.forEach(tag => {
                if (tags[tag]) {
                    urlsToScrape.push(tags[tag]);
                }
            });
        } else {
            urlsToScrape.push(searchall);
        }

        let allStories = [];
        for (const url of urlsToScrape) {
            const scraped = await scrapeWebsite(url, searchQuery);
            allStories = allStories.concat(scraped);
        }

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
        if (client) {
            client.release();
        }
    }
};