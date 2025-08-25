// netlify/functions/scrape-category-by-schedule.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const { tags } = require('../../categories'); // We only need the tags object
const { Pool } = require('pg');

let pool;

async function ensureDbInitialized() {
    if (!pool) {
        pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL, ssl: { rejectUnauthorized: false } });
        const client = await pool.connect();
        try {
            // Create the stories table if it doesn't exist
            await client.query(`CREATE TABLE IF NOT EXISTS stories (id SERIAL PRIMARY KEY, title TEXT NOT NULL, url TEXT UNIQUE NOT NULL, categories TEXT[], synopsis TEXT, last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`);
            // Create and initialize the state tracking table
            await client.query(`CREATE TABLE IF NOT EXISTS scrape_state (id INT PRIMARY KEY, last_scraped_category_index INT);`);
            await client.query(`INSERT INTO scrape_state (id, last_scraped_category_index) VALUES (1, -1) ON CONFLICT (id) DO NOTHING;`);
        } finally {
            client.release();
        }
    }
    return pool;
}

// Utility to scrape a single story's synopsis
async function scrapeSynopsisPage(browser, storyUrl) {
    let page = null;
    try {
        page = await browser.newPage();
        await page.goto(storyUrl, { waitUntil: 'networkidle0', timeout: 20000 }); // 20 second timeout per page
        const data = await page.content();
        const $ = cheerio.load(data);
        const storyContentDiv = $('section.synopsis, div#storytext').first();
        if (storyContentDiv.length > 0) {
            let rawSynopsis = storyContentDiv.find('p').first().text().trim() || storyContentDiv.text().trim();
            let synopsis = rawSynopsis.replace(/\s+/g, ' ').substring(0, 1000);
            if (rawSynopsis.length > 1000) synopsis += '...';
            return synopsis;
        }
        return 'Synopsis not available.';
    } catch (e) {
        console.error(`Timeout or error scraping synopsis for ${storyUrl}:`, e.message);
        return 'Synopsis could not be retrieved.';
    } finally {
        if (page) await page.close();
    }
}

exports.handler = async () => {
    let client;
    let browser = null;
    try {
        const dbPool = await ensureDbInitialized();
        client = await dbPool.connect();

        // 1. Get the last scraped category index from the database
        const stateResult = await client.query('SELECT last_scraped_category_index FROM scrape_state WHERE id = 1');
        const lastIndex = stateResult.rows[0].last_scraped_category_index;
        
        const categoryKeys = Object.keys(tags);
        const nextIndex = (lastIndex + 1) % categoryKeys.length;
        const categoryToScrape = categoryKeys[nextIndex];
        const urlToScrape = tags[categoryToScrape];

        console.log(`Starting scheduled scrape for category: [${categoryToScrape.toUpperCase()}]`);

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        // 2. Scrape the category index page
        const mainPage = await browser.newPage();
        await mainPage.goto(urlToScrape, { waitUntil: 'networkidle0' });
        const mainHtml = await mainPage.content();
        await mainPage.close();

        const $ = cheerio.load(mainHtml);
        const storiesOnPage = [];
        $('a[href$="/index.html"]').each((i, element) => {
            const title = $(element).text().trim();
            const link = $(element).attr('href');
            if (title && link) {
                const fullLink = new URL(link, urlToScrape).href;
                if (!fullLink.includes('/Authors/') && !fullLink.includes('/Tags/')) {
                    const categoriesTd = $(element).parent('td').next('td');
                    const categories = categoriesTd.text().trim().split(' ').filter(cat => cat.length > 0);
                    storiesOnPage.push({ title, link: fullLink, categories });
                }
            }
        });
        console.log(`Found ${storiesOnPage.length} stories in category [${categoryToScrape.toUpperCase()}]. Fetching synopses...`);

        // 3. Scrape all synopses for the found stories
        const synopsisPromises = storiesOnPage.map(story =>
            scrapeSynopsisPage(browser, story.link).then(synopsis => {
                story.synopsis = synopsis;
                return story;
            })
        );
        const storiesWithData = await Promise.all(synopsisPromises);

        // 4. Save results to the database
        console.log(`Saving ${storiesWithData.length} stories to the database...`);
        await client.query('BEGIN');
        for (const story of storiesWithData) {
            await client.query(
                `INSERT INTO stories (title, url, categories, synopsis) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, categories = EXCLUDED.categories, synopsis = EXCLUDED.synopsis, last_scraped_at = CURRENT_TIMESTAMP`,
                [story.title, story.link, story.categories, story.synopsis]
            );
        }
        await client.query('COMMIT');

        // 5. Update the state for the next run
        await client.query('UPDATE scrape_state SET last_scraped_category_index = $1 WHERE id = 1', [nextIndex]);

        console.log(`Successfully finished scrape for category: [${categoryToScrape.toUpperCase()}]`);
        return { statusCode: 200, body: 'Scrape successful.' };
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error in scheduled scrape handler:", error);
        return { statusCode: 500 };
    } finally {
        if (browser) await browser.close();
        if (client) client.release();
    }
};