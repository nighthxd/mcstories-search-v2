// netlify/functions/scrape-categories.js
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
            console.log('Database pool connected successfully for search.');
            client.release();
        } catch (err) {
            console.error('Failed to connect to DB for search:', err);
            pool = null;
            throw new Error('Database initialization for search failed.');
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
            searchQuery = event.queryStringParameters.query.trim();
        }
    }

    let client;

    try {
        const pool = await ensureDbInitialized();
        client = await pool.connect();
        
        // This function now ONLY queries the database. No scraping.
        console.log(`Searching database for: query='${searchQuery}', include='${includedTags}', exclude='${excludedTags}'`);

        // Build the SQL query dynamically
        const queryParams = [];
        let whereClauses = [];

        if (searchQuery) {
            queryParams.push(`%${searchQuery}%`);
            whereClauses.push(`title ILIKE $${queryParams.length}`);
        }

        if (includedTags.length > 0) {
            queryParams.push(includedTags);
            whereClauses.push(`categories @> $${queryParams.length}`);
        }

        if (excludedTags.length > 0) {
            queryParams.push(excludedTags);
            whereClauses.push(`NOT (categories && $${queryParams.length})`);
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const sqlQuery = `SELECT title, url, categories, synopsis FROM stories ${whereString} ORDER BY title;`;

        const searchResult = await client.query(sqlQuery, queryParams);

        console.log(`Found ${searchResult.rows.length} stories in the database.`);

        return {
            statusCode: 200,
            body: JSON.stringify(searchResult.rows),
        };

    } catch (error) {
        console.error("Error in database search handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error occurred while searching the database.' }),
        };
    } finally {
        if (client) {
            client.release();
        }
    }
};