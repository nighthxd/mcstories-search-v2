// netlify/functions/get-synopsis.js
const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg'); // Import PostgreSQL client library

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

        // Optional: Test the connection
        try {
            const client = await pool.connect();
            client.release();
            console.log('Database pool connected successfully for get-synopsis.');
        } catch (err) {
            console.error('Failed to connect to DB for get-synopsis:', err);
            pool = null; // Invalidate pool if connection fails
            throw new Error('Database initialization for get-synopsis failed.');
        }
    }
    return pool;
}

exports.handler = async (event, context) => {
    const storyUrl = event.queryStringParameters.url;
    let client; // Declare client here for finally block

    if (!storyUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing story URL parameter.' }),
        };
    }

    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect();

        // 1. Try to retrieve synopsis from the database first
        try {
            const dbResponse = await client.query(
                `SELECT synopsis FROM stories WHERE url = $1 AND synopsis IS NOT NULL AND synopsis != ''`,
                [storyUrl]
            );

            if (dbResponse.rows.length > 0 && dbResponse.rows[0].synopsis) {
                console.log(`Synopsis found in cache for: ${storyUrl}`);
                return {
                    statusCode: 200,
                    body: JSON.stringify({ synopsis: dbResponse.rows[0].synopsis }),
                };
            }
            console.log(`Synopsis not found in cache for: ${storyUrl}, attempting to scrape.`);

        } catch (dbError) {
            console.error(`Error checking DB for synopsis for ${storyUrl}:`, dbError.message);
            // Continue to scrape if DB check fails
        }

        // 2. If not in DB, scrape it from mcstories.com
        console.log(`Attempting to scrape synopsis for: ${storyUrl}`);
        const { data } = await axios.get(storyUrl, { timeout: 5000 }); // Short timeout for single page
        const $ = cheerio.load(data);

        let scrapedSynopsis = 'Synopsis not available.'; // Default placeholder if scraping fails

        const storyContentDiv = $('section.synopsis, div#storytext, div.panel-body, div#content, div.story-content, article.story-article, .main-content-area').first(); 
        
        if (storyContentDiv.length > 0) {
            let rawSynopsis = storyContentDiv.find('p').first().text().trim();
            if (!rawSynopsis) { 
                rawSynopsis = storyContentDiv.text().trim();
            }

            scrapedSynopsis = rawSynopsis.replace(/\s+/g, ' ').substring(0, 1000); 
            if (rawSynopsis.length > 1000) {
                scrapedSynopsis += '...';
            } else if (rawSynopsis.length === 0) {
                scrapedSynopsis = 'No synopsis text found within the identified content area.';
            }
        } else {
            scrapedSynopsis = 'Could not locate the main story content area on this page (selector mismatch).';
        }

        // 3. Save the newly scraped synopsis to the database
        try {
            await client.query(
                `UPDATE stories SET synopsis = $1 WHERE url = $2`,
                [scrapedSynopsis, storyUrl]
            );
            console.log(`Successfully cached synopsis for: ${storyUrl}`);
        } catch (dbError) {
            console.error(`Error updating DB with scraped synopsis for ${storyUrl}:`, dbError.message);
            // Log the error but don't fail the response
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ synopsis: scrapedSynopsis }),
        };

    } catch (error) {
        console.error(`Error in get-synopsis function handler for ${storyUrl}:`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Failed to fetch or cache synopsis for ${storyUrl}.` }),
        };
    } finally {
        if (client) {
            client.release(); // Release the database client back to the pool
        }
    }
};