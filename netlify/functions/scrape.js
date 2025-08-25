// netlify/functions/scrape.js
const axios = require('axios');
const cheerio = require('cheerio');
const { searchall } = require('../../categories');
const { scrapeWebsite } = require('./utils/sharedScraperUtils');
const { Pool = require('pg');

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

    const { query } = JSON.parse(event.body || '{}');
    let client;

    try {
        const pool = await ensureDbInitialized();
        client = await pool.connect();

        // 1. Check cache
        const cacheKey = `${query}`;
        const cachedStoriesResult = await client.query(
            `SELECT title, url, categories, synopsis FROM stories WHERE ($1 = '' OR title ILIKE '%' || $1 || '%') AND last_scraped_at > NOW() - INTERVAL '1 hour'`, // Removed LIMIT 100
            [query]
        );

        if (cachedStoriesResult.rows.length > 0) {
            console.log(`Returning ${cachedStoriesResult.rows.length} stories from cache for query: "${query}"`);
            return {
                statusCode: 200,
                body: JSON.stringify(cachedStoriesResult.rows),
            };
        }

        // If not in cache, proceed with scraping
        console.log(`No fresh cache found for query: "${query}". Initiating scrape.`);
        const allStories = await scrapeWebsite(searchall, query);

        // Filter and ensure uniqueness before saving to DB
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