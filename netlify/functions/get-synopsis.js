// netlify/functions/get-synopsis.js
const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg'); // PostgreSQL client library

// Initialize a connection pool outside the handler
// This allows the connection to be reused across warm invocations of the function
// It will be lazily initialized or on the first invocation.
let pool;

async function ensureDbInitialized() {
    if (!pool) {
        if (!process.env.NETLIFY_DATABASE_URL) {
            throw new Error('NETLIFY_DATABASE_URL environment variable is not set.');
        }

        pool = new Pool({
            connectionString: process.env.NETLIFY_DATABASE_URL,
            ssl: {
                // Adjust this based on your NeonDB setup.
                // For production, it's generally recommended to verify the certificate.
                // For simple testing, rejectUnauthorized: false might be used,
                // but this lowers security.
                rejectUnauthorized: false
            }
        });

        // Test the connection and create table if it doesn't exist
        try {
            const client = await pool.connect();
            await client.query(`
                CREATE TABLE IF NOT EXISTS synopses (
                    url TEXT PRIMARY KEY,
                    content TEXT,
                    cached_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('Database table "synopses" ensured to exist.');
            client.release(); // Release the client back to the pool
        } catch (err) {
            console.error('Failed to connect to DB or create table:', err);
            // Invalidate the pool if initialization failed
            pool = null;
            throw new Error('Database initialization failed.');
        }
    }
    return pool;
}

exports.handler = async (event, context) => {
    const storyUrl = event.queryStringParameters.url;

    if (!storyUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Story URL is required.' }),
        };
    }

    let client; // Declare client here to ensure it's accessible in finally block

    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect();

        // 1. Check for cached synopsis in the database
        const cachedResult = await client.query('SELECT content FROM synopses WHERE url = $1', [storyUrl]);
        if (cachedResult.rows.length > 0) {
            console.log(`Serving synopsis for ${storyUrl} from PostgreSQL cache.`);
            return {
                statusCode: 200,
                body: JSON.stringify({ synopsis: cachedResult.rows[0].content }),
            };
        }

        // 2. If not in cache, fetch from the web
        console.log(`Fetching synopsis for ${storyUrl} from the web.`);
        const { data } = await axios.get(storyUrl, { timeout: 10000 }); // 10 seconds timeout
        const $ = cheerio.load(data);

        const synopsis = $('section.synopsis').text().trim();
        const finalSynopsis = synopsis || 'Synopsis not available.';

        // 3. Store the freshly fetched synopsis in the database
        await client.query(
            'INSERT INTO synopses (url, content) VALUES ($1, $2) ON CONFLICT (url) DO UPDATE SET content = EXCLUDED.content, cached_at = CURRENT_TIMESTAMP',
            [storyUrl, finalSynopsis]
        );
        console.log(`Synopsis for ${storyUrl} stored/updated in PostgreSQL cache.`);

        return {
            statusCode: 200,
            body: JSON.stringify({ synopsis: finalSynopsis }),
        };
    } catch (error) {
        console.error(`Error in get-synopsis function for ${storyUrl}:`, error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error processing synopsis request.' }),
        };
    } finally {
        // Release the client back to the pool
        if (client) {
            client.release();
        }
    }
};