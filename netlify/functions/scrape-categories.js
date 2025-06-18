// netlify/functions/scrape-categories.js
const axios = require('axios');
const cheerio = require('cheerio');
const { tags } = require('../../categories');
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
    const selectedTags = event.queryStringParameters.tags;
    const searchQuery = event.queryStringParameters.query || '';
    let client;

    if (!selectedTags) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No categories selected' }),
        };
    }

    const tagArray = selectedTags.split(',');

    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect();

        // --- Caching Logic: Try to fetch from DB first ---
        let cachedStories = [];
        const CACHE_LIFETIME_HOURS = 24; // Define how long results are considered fresh

        try {
            // Adjust cache query for category search
            // This query assumes stories are cached with all their categories
            // It will find stories that match ALL selected tags AND the search query
            const cacheQuery = `
                SELECT title, url, categories
                FROM stories
                WHERE ($1 = '' OR title ILIKE $1)
                  AND categories @> $2::text[]
                  AND last_scraped_at >= NOW() - INTERVAL '${CACHE_LIFETIME_HOURS} hours';
            `;
            // If searchQuery is empty, use '%%' to match all titles.
            const queryParamSearch = searchQuery ? `%${searchQuery}%` : '';

            const { rows } = await client.query(cacheQuery, [queryParamSearch, tagArray]);

            // --- LOGGING FOR DEBUGGING CATEGORY CACHE ---
            console.log("Cache query for tags:", selectedTags, "query:", searchQuery);
            console.log("Database rows found for cache:", rows.length);
            // console.log("First 5 cached rows:", rows.slice(0, 5)); // Uncomment this line if you want to see actual data snippet for rows
            // --- END LOGGING ---

            cachedStories = rows.map(row => ({
                title: row.title,
                link: row.url,
                categories: row.categories || []
            }));

            if (cachedStories.length > 0) {
                console.log(`Returning ${cachedStories.length} stories from cache for tags: "${selectedTags}" and query: "${searchQuery}"`);
                return {
                    statusCode: 200,
                    body: JSON.stringify(cachedStories),
                };
            }
            console.log(`No fresh cached results for tags: "${selectedTags}" and query: "${searchQuery}". Proceeding to scrape.`);

        } catch (cacheError) {
            console.error('Error fetching from cache, proceeding with scrape:', cacheError.message);
            // If there's a cache error, just proceed to scrape
        }
        // --- End Caching Logic ---


        // --- Original Scraping Logic (Fall-back if no cache hit) ---
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