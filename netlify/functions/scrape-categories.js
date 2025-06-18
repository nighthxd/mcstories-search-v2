// netlify/functions/scrape-categories.js
const axios = require('axios');
const cheerio = require('cheerio');
const { tags } = require('../../categories'); // Corrected path
const { scrapeWebsite } = require('./utils/sharedScraperUtils'); // Corrected path
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
                    synopsis TEXT,               -- ADDED: Synopsis column
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
    const includedTags = event.queryStringParameters.tags ? event.queryStringParameters.tags.split(',') : [];
    const excludedTags = event.queryStringParameters.exclude_tags ? event.queryStringParameters.exclude_tags.split(',') : [];
    const searchQuery = event.queryStringParameters.query || '';
    let client;

    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect();

        let storiesFromDb = [];
        // First, try to fetch from DB cache based on tags and query
        if (includedTags.length > 0 || excludedTags.length > 0 || searchQuery) {
            // Build dynamic WHERE clause for categories and search query
            let whereClauses = [];
            let queryParams = [];
            let paramIndex = 1;

            // Handle included tags
            if (includedTags.length > 0) {
                whereClauses.push(`categories @> $${paramIndex++}::text[]`);
                queryParams.push(includedTags);
            }

            // Handle excluded tags
            if (excludedTags.length > 0) {
                whereClauses.push(`NOT (categories && $${paramIndex++}::text[])`);
                queryParams.push(excludedTags);
            }

            // Handle search query for title
            if (searchQuery) {
                whereClauses.push(`title ILIKE $${paramIndex++}`);
                queryParams.push(`%${searchQuery}%`);
            }

            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            console.log(`Cache query for tags: ${includedTags.join(',')} query: ${searchQuery} exclude: ${excludedTags.join(',')}`);
            const dbResponse = await client.query(`SELECT title, url, categories, synopsis FROM stories ${whereClause} ORDER BY last_scraped_at DESC LIMIT 100`, queryParams);
            storiesFromDb = dbResponse.rows;
            console.log(`Database rows found for cache: ${storiesFromDb.length}`);

            if (storiesFromDb.length > 0) {
                console.log(`Returning ${storiesFromDb.length} stories from cache for tags: "${includedTags.join(',')}" and query: "${searchQuery}"`);
                return {
                    statusCode: 200,
                    body: JSON.stringify(storiesFromDb),
                };
            }
        }

        // If no cache hit, proceed with scraping
        console.log("No cache hit or empty query, proceeding with scraping.");

        const urlsToScrape = includedTags.length > 0
            ? includedTags.map(tag => `https://mcstories.com/Tags/${tag}.html`)
            : searchall; // Fallback to searchall if no specific tags

        const scrapePromises = urlsToScrape.map(url => scrapeWebsite(url, searchQuery));
        const resultsPerUrl = await Promise.all(scrapePromises);
        let allStories = resultsPerUrl.flat();

        const uniqueStories = [];
        const seenLinks = new Set(); // Use Set for efficient checking of unique links

        for (const story of allStories) {
            if (!seenLinks.has(story.link)) {
                seenLinks.add(story.link);

                // Apply filtering for included/excluded tags and search query
                const hasIncludedTags = includedTags.length === 0 || includedTags.every(tag => story.categories.includes(tag));
                const hasExcludedTags = excludedTags.length > 0 && excludedTags.some(tag => story.categories.includes(tag));
                const matchesSearchQuery = searchQuery === '' || story.title.toLowerCase().includes(searchQuery.toLowerCase());

                if (hasIncludedTags && !hasExcludedTags && matchesSearchQuery) {
                    uniqueStories.push(story);

                    // --- Store/Update story in database ---
                    try {
                        await client.query(
                            `INSERT INTO stories (title, url, categories, synopsis)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (url) DO UPDATE SET
                                 title = EXCLUDED.title,
                                 categories = EXCLUDED.categories,
                                 synopsis = EXCLUDED.synopsis, -- UPDATED: Also update synopsis
                                 last_scraped_at = CURRENT_TIMESTAMP`,
                            [story.title, story.link, story.categories, story.synopsis] // UPDATED: Add story.synopsis
                        );
                        // console.log(`Stored/Updated story "${story.title}" in DB.`); // Optional: log each story saved
                    } catch (dbError) {
                        console.error(`Error saving story "${story.title}" to DB:`, dbError.message);
                        // Continue processing, don't fail the whole function if one story save fails
                    }
                    // --- End DB storage ---\
                }
            }
        }
        
        // Final filter to ensure excluded tags are handled if allStories didn't catch them
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
            client.release(); // Release client back to the pool
        }
    }
};