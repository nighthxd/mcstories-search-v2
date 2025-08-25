// netlify/functions/get-synopsis.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const { Pool } = require('pg');

let pool;

async function ensureDbInitialized() {
    if (!pool) {
        if (!process.env.NETLIFY_DATABASE_URL) {
            throw new Error('NETLIFY_DATABASE_URL environment variable is not set.');
        }
        pool = new Pool({
            connectionString: process.env.NETLIFY_DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        try {
            const client = await pool.connect();
            client.release();
            console.log('Database pool connected successfully for get-synopsis.');
        } catch (err) {
            console.error('Failed to connect to DB for get-synopsis:', err);
            pool = null;
            throw new Error('Database initialization for get-synopsis failed.');
        }
    }
    return pool;
}

exports.handler = async (event, context) => {
    const storyUrl = event.queryStringParameters.url;
    if (!storyUrl) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing story URL parameter.' }) };
    }

    let client;
    let browser = null;

    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect();

        const dbResponse = await client.query(
            `SELECT synopsis FROM stories WHERE url = $1 AND synopsis IS NOT NULL AND synopsis != ''`,
            [storyUrl]
        );

        if (dbResponse.rows.length > 0 && dbResponse.rows[0].synopsis) {
            console.log(`Synopsis found in cache for: ${storyUrl}`);
            return { statusCode: 200, body: JSON.stringify({ synopsis: dbResponse.rows[0].synopsis }) };
        }

        console.log(`Synopsis not in cache. Scraping with Puppeteer for: ${storyUrl}`);

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
        const page = await browser.newPage();
        await page.goto(storyUrl, { waitUntil: 'networkidle0' });
        const data = await page.content();
        const $ = cheerio.load(data);

        let scrapedSynopsis = 'Synopsis not available.';
        const storyContentDiv = $('section.synopsis, div#storytext, div.panel-body, div#content, div.story-content, article.story-article, .main-content-area').first();

        if (storyContentDiv.length > 0) {
            let rawSynopsis = storyContentDiv.find('p').first().text().trim() || storyContentDiv.text().trim();
            scrapedSynopsis = rawSynopsis.replace(/\s+/g, ' ').substring(0, 1000);
            if (rawSynopsis.length > 1000) scrapedSynopsis += '...';
            if (rawSynopsis.length === 0) scrapedSynopsis = 'No synopsis text found in content area.';
        } else {
            scrapedSynopsis = 'Could not locate the main story content area.';
        }

        await client.query(
            `UPDATE stories SET synopsis = $1 WHERE url = $2`,
            [scrapedSynopsis, storyUrl]
        );
        console.log(`Successfully cached synopsis for: ${storyUrl}`);
        
        return { statusCode: 200, body: JSON.stringify({ synopsis: scrapedSynopsis }) };

    } catch (error) {
        console.error(`Error in get-synopsis handler for ${storyUrl}:`, error);
        return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch synopsis.` }) };
    } finally {
        if (client) client.release();
        if (browser) await browser.close();
    }
};