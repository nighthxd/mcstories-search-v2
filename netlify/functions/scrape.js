// netlify/functions/scrape.js
const axios = require('axios');
const cheerio = require('cheerio');
const { searchall } = require('../../categories');
const { scrapeWebsite } = require('./utils/sharedScraperUtils');
const { Pool } = require('pg');

// Initialize a connection pool outside the handler
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
                    last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('Database table "stories" ensured to exist.');
            client.release();
        } catch (err) {
            console.error('Failed to connect to DB or create "stories" table:', err);
            pool = null;
            throw new Error('Database initialization for stories failed.');
        }
    }
    return pool;
}

exports.handler = async (event, context) => {
    const searchQuery = event.queryStringParameters.query || '';
    let client;

    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect();

        // --- Caching Logic: Try to fetch from DB first ---
        let cachedStories = [];
        const CACHE_LIFETIME_HOURS = 24; // Define how long results are considered fresh (e.g., 24 hours)

        try {
            const cacheQuery = `
                SELECT title, url, categories
                FROM stories
                WHERE title ILIKE $1 AND last_scraped_at >= NOW() - INTERVAL '${CACHE_LIFETIME_HOURS} hours';
            `;
            const { rows } = await client.query(cacheQuery, [`%${searchQuery}%`]);

            cachedStories = rows.map(row => ({
                title: row.title,
                link: row.url,
                categories: row.categories || [] // Ensure categories is an array
            }));

            if (cachedStories.length > 0) {
                console.log(`Returning ${cachedStories.length} stories from cache for query: "${searchQuery}"`);
                return {
                    statusCode: 200,
                    body: JSON.stringify(cachedStories),
                };
            }
            console.log(`No fresh cached results for query: "${searchQuery}". Proceeding to scrape.`);

        } catch (cacheError) {
            console.error('Error fetching from cache, proceeding with scrape:', cacheError.message);
            // If there's a cache error, just proceed to scrape
        }
        // --- End Caching Logic ---


        // --- Original Scraping Logic (Fall-back if no cache hit) ---
        const scrapePromises = searchall.map(url => scrapeWebsite(url, searchQuery));
        const resultsPerUrl = await Promise.all(scrapePromises);
        let allStories = resultsPerUrl.flat();

        const uniqueStories = [];
        const seenTitles = new Set();
        for (const story of allStories) {
            if (!seenTitles.has(story.title)) {
                seenTitles.add(story.title);
                uniqueStories.push(story);

                // --- Store/Update story in database ---
                try {
                    await client.query(
                        `INSERT INTO stories (title, url, categories)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (url) DO UPDATE SET
                             title = EXCLUDED.title,
                             categories = EXCLUDED.categories,
                             last_scraped_at = CURRENT_TIMESTAMP`,
                        [story.title, story.link, story.categories]
                    );
                } catch (dbError) {
                    console.error(`Error saving story "${story.title}" to DB during scrape fallback:`, dbError.message);
                }
                // --- End DB storage ---
            }
        }
        // --- End Original Scraping Logic ---

        return {
            statusCode: 200,
            body: JSON.stringify(uniqueStories),
        };
    } catch (error) {
        console.error("Error in scrape function handler:", error);
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