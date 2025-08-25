// netlify/functions/scrape-categories.js
require('@sparticuz/brotli');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { tags, searchall } = require('../../categories');
const { scrapeWebsite } = require('./utils/sharedScraperUtils');
const { Pool } = require('pg');

// ... (your ensureDbInitialized function is the same)

exports.handler = async (event, context) => {
    // ... (your parameter handling code is the same)
    
    let client;
    let browser = null; // Initialize browser to null

    try {
        const pool = await ensureDbInitialized();
        client = await pool.connect();

        // ... (your cache checking logic is the same)
        
        console.log(`No fresh cache. Launching browser...`);
        
        // 1. LAUNCH BROWSER ONCE
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        let urlsToScrape = [];
        if (includedTags.length > 0) {
            includedTags.forEach(tag => {
                if (tags[tag]) urlsToScrape.push(tags[tag]);
            });
        } else {
            urlsToScrape.push(...searchall);
        }
        
        // 2. RUN SCRAPES IN PARALLEL, PASSING THE BROWSER INSTANCE
        console.log(`Scraping ${urlsToScrape.length} URLs in parallel.`);
        const scrapePromises = urlsToScrape.map(url => scrapeWebsite(browser, url));
        const results = await Promise.all(scrapePromises);
        const allStories = results.flat();

        // ... (your logic for saving to the DB and filtering is the same)

        return {
            statusCode: 200,
            body: JSON.stringify(finalUniqueStories),
        };
    } catch (error) {
        console.error("Error in scrape-categories function handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error occurred while scraping' }),
        };
    } finally {
        // 3. CLOSE BROWSER ONCE AT THE END
        if (browser !== null) {
            await browser.close();
            console.log("Browser closed successfully.");
        }
        if (client) {
            client.release();
        }
    }
};