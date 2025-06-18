// netlify/functions/scrape-categories.js
const axios = require('axios');
const cheerio = require('cheerio');
const { tags } = require('../../categories');
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
                    last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('Database table "stories" ensured to exist.');
            client.release();
        } catch (err) {
            console.error('Error ensuring DB initialized:', err);
            throw err;
        }
    }
}

exports.handler = async (event, context) => {
    await ensureDbInitialized();
    const client = await pool.connect();

    try {
        const tagsParam = event.queryStringParameters.tags;
        const query = event.queryStringParameters.query || '';
        const excludeTagsParam = event.queryStringParameters.exclude_tags; // New: Get exclude_tags parameter

        let includedTags = [];
        if (tagsParam) {
            includedTags = tagsParam.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }

        let excludedTags = []; // New: Initialize excludedTags array
        if (excludeTagsParam) {
            excludedTags = excludeTagsParam.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }

        let cacheWhereClause = 'WHERE TRUE';
        let cacheQueryParams = [];
        let paramIndex = 1;

        if (includedTags.length > 0) {
            cacheWhereClause += ` AND categories @> $${paramIndex++}::text[]`;
            cacheQueryParams.push(includedTags);
        }
        if (query) {
            cacheWhereClause += ` AND title ILIKE $${paramIndex++}`;
            cacheQueryParams.push(`%${query}%`);
        }
        // New: Add exclusion to cache query
        if (excludedTags.length > 0) {
            cacheWhereClause += ` AND NOT (categories && $${paramIndex++}::text[])`;
            cacheQueryParams.push(excludedTags);
        }

        const cacheKey = `${tagsParam || ''}:${query}:${excludeTagsParam || ''}`; // New: Include excludeTagsParam in cache key
        const cacheQuery = `SELECT title, url, categories FROM stories ${cacheWhereClause} AND last_scraped_at > NOW() - INTERVAL '1 hour'`;
        const cacheResult = await client.query(cacheQuery, cacheQueryParams);

        console.log(`Cache query for tags: ${tagsParam || ''} query: ${query || ''} exclude: ${excludeTagsParam || ''}`); // Updated log
        console.log(`Database rows found for cache: ${cacheResult.rows.length}`);

        if (cacheResult.rows.length > 0) {
            console.log(`Returning ${cacheResult.rows.length} stories from cache for tags: "${tagsParam || ''}" and query: "${query || ''}"`); // Updated log
            return {
                statusCode: 200,
                body: JSON.stringify(cacheResult.rows),
            };
        }

        console.log(`No fresh cached results for tags: "${tagsParam || ''}" and query: "${query || ''}". Proceeding to scrape.`); // Updated log

        let uniqueStories = [];
        // Scrape for each included tag
        for (const tag of includedTags) {
            const urlToScrape = `https://mcstories.com/Tags/${tag}.html`;
            const scrapedStories = await scrapeWebsite(urlToScrape, query); // scrapeWebsite already handles the query filter internally

            scrapedStories.forEach(story => {
                // Ensure story is not already in uniqueStories array based on URL
                if (!uniqueStories.some(s => s.link === story.link)) {
                    uniqueStories.push(story);
                }
            });
        }
        // If no specific tags, scrape the main page (or handle as per your logic)
        if (includedTags.length === 0 && !query) {
             const scrapedMainPageStories = await scrapeWebsite('https://mcstories.com/index.html');
             scrapedMainPageStories.forEach(story => {
                 if (!uniqueStories.some(s => s.link === story.link)) {
                     uniqueStories.push(story);
                 }
             });
        } else if (includedTags.length === 0 && query) {
            // If only query, but no tags, scrape main index and filter by query
            const scrapedMainPageStories = await scrapeWebsite('https://mcstories.com/index.html', query);
             scrapedMainPageStories.forEach(story => {
                 if (!uniqueStories.some(s => s.link === story.link)) {
                     uniqueStories.push(story);
                 }
             });
        }


        // New: Apply filtering for tags, query, AND EXCLUDED TAGS to scraped results before saving/returning
        let finalUniqueStories = uniqueStories.filter(story => {
            const storyCategories = story.categories || [];

            // Filter by included tags (if any were specified)
            const includesAllTags = includedTags.length === 0 || includedTags.every(tag => storyCategories.includes(tag));

            // Filter by query (if any was specified) - note: scrapeWebsite already filters by query but
            // this acts as a final safeguard/re-filter, especially if query was part of initial scrape.
            // If scrapeWebsite only fetches all stories and relies on this filter, then this is essential.
            const matchesQuery = query === '' || story.title.toLowerCase().includes(query.toLowerCase());

            // Filter by excluded tags (NEW)
            const excludesAnyTags = excludedTags.length > 0 && excludedTags.some(tag => storyCategories.includes(tag));

            return includesAllTags && matchesQuery && !excludesAnyTags; // Story must NOT include any excluded tags
        });


        // Store/Update story in database
        for (const story of finalUniqueStories) {
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
                console.error(`Error saving story "${story.title}" to DB:`, dbError.message);
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
            client.release();
        }
    }
};