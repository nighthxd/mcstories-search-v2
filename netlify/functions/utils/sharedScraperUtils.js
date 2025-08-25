// netlify/functions/utils/sharedScraperUtils.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const excludedLinks = require('../../../excludedLinks');

async function scrapeWebsite(url, searchQuery = '') {
    console.log(`Starting Puppeteer scrape for URL: ${url}`);
    let browser = null;

    try {
        // Launch the browser using the serverless-ready chromium package
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        
        // Make the scraper look like a real user
        await page.setUserAgent('Mozilla/5.o (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');

        // Navigate to the URL and wait for the page to settle
        await page.goto(url, { waitUntil: 'networkidle0' });

        // Get the final HTML content after JS has run
        const data = await page.content();
        const $ = cheerio.load(data);

        let stories = [];

        // Parse the page for story links and data
        $('a[href$="/index.html"]').each((i, element) => {
            const title = $(element).text().trim();
            const link = $(element).attr('href');
            const fullLink = new URL(link, url).href;

            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);
            
            if (title && link && !isAuthorOrTagPage && !isExcluded) {
                const categories = [];
                const parentTd = $(element).parent('td');
                const categoriesTd = parentTd.next('td');
                if (categoriesTd.length > 0) {
                    const categoryText = categoriesTd.text().trim();
                    const extractedCats = categoryText.split(' ').filter(cat => cat.length > 0);
                    categories.push(...extractedCats);
                }
                
                stories.push({ 
                    title, 
                    link: fullLink, 
                    categories: categories, 
                    synopsis: '' // Initially empty synopsis
                });
            }
        });

        console.log(`Finished Puppeteer scrape for URL: ${url}. Found ${stories.length} stories.`);
        return stories;

    } catch (error) {
        console.error(`Error scraping ${url} with Puppeteer:`, error);
        return [];
    } finally {
        // IMPORTANT: Always close the browser instance to free up resources
        if (browser !== null) {
            await browser.close();
        }
    }
}

module.exports = { scrapeWebsite };