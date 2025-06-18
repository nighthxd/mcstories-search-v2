// netlify/functions/scrape-categories.js
const axios = require('axios');
const cheerio = require('cheerio'); // Still used by sharedScraperUtils, but not directly here anymore
const { tags } = require('../../categories'); // Corrected path
const { scrapeWebsite } = require('./utils/sharedScraperUtils'); // Correctly imports updated scrapeWebsite
const { Pool } = require('pg'); // PostgreSQL client library

// Initialize a connection pool outside the handler
let pool; // Reusing the global pool variable logic

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

        // Test the connection and create 'stories' table if it doesn't exist
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
            pool = null; // Invalidate pool if initialization failed
            throw new Error('Database initialization for stories failed.');
        }
    }
    return pool;
}

exports.handler = async (event, context) => {
    const selectedTags = event.queryStringParameters.tags;
    const searchQuery = event.queryStringParameters.query || '';
    let client; // Declare client for finally block

    if (!selectedTags) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No categories selected' }),
        };
    }

    const tagArray = selectedTags.split(',');

    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect(); // Get a client from the pool

        const urlsToScrape = tagArray.map(tag => tags[tag]).filter(url => url);

        if (urlsToScrape.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No valid category URLs found' }),
            };
        }

        const allStoriesPerTag = await Promise.all(
            urlsToScrape.map(url => scrapeWebsite(url, searchQuery))
        );

        let finalStories = [];

        if (tagArray.length === 1) {
            finalStories = allStoriesPerTag.flat();
        } else {
            if (allStoriesPerTag.length > 0) {
                let commonStories = allStoriesPerTag[0];

                for (let i = 1; i < allStoriesPerTag.length; i++) {
                    const currentTagStories = allStoriesPerTag[i];
                    commonStories = commonStories.filter(story =>
                        currentTagStories.some(s => s.title === story.title)
                    );
                    if (commonStories.length === 0) break;
                }
                finalStories = commonStories;
            }
        }

        const finalUniqueStories = [];
        const uniqueTitles = new Set();
        for (const story of finalStories) {
            if (!uniqueTitles.has(story.title)) {
                uniqueTitles.add(story.title);
                finalUniqueStories.push(story);

                // --- Store/Update story in database ---
                try {
                    await client.query(
                        `INSERT INTO stories (title, url, categories)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (url) DO UPDATE SET
                             title = EXCLUDED.title,
                             categories = EXCLUDED.categories,
                             last_scraped_at = CURRENT_TIMESTAMP`,
                        [story.title, story.link, story.categories] // story.link is the URL
                    );
                    // console.log(`Stored/Updated story "${story.title}" in DB.`); // Optional: log each story saved
                } catch (dbError) {
                    console.error(`Error saving story "${story.title}" to DB:`, dbError.message);
                    // Continue processing, don't fail the whole function if one story save fails
                }
                // --- End DB storage ---
            }
        }

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
            client.release(); // Release client back to the pool
        }
    }
};