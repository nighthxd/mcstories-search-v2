// netlify/functions/scrape.js
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
    }
    return pool;
}

exports.handler = async (event, context) => {
    // This function now only reads from the database. It does not scrape.
    const { query } = JSON.parse(event.body || '{}');
    let client;

    try {
        const pool = await ensureDbInitialized();
        client = await pool.connect();

        console.log(`Searching database for simple query: "${query}"`);

        const searchResult = await client.query(
            `SELECT title, url, categories, synopsis FROM stories WHERE ($1 = '' OR title ILIKE '%' || $1 || '%') ORDER BY title`,
            [query || '']
        );

        console.log(`Found ${searchResult.rows.length} stories in the database.`);

        return {
            statusCode: 200,
            body: JSON.stringify(searchResult.rows),
        };
    } catch (error) {
        console.error("Error in scrape function handler:", error);
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