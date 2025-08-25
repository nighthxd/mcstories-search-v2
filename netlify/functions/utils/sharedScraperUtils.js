// netlify/functions/utils/sharedScraperUtils.js
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const excludedLinks = require('../../../excludedLinks');

// The function now accepts a 'browser' instance as the first argument
async function scrapeWebsite(browser, url) {
    let page = null;
    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }); // Added a longer timeout for navigation

        const data = await page.content();
        const $ = cheerio.load(data);

        let stories = [];
        $('a[href$="/index.html"]').each((i, element) => {
            const title = $(element).text().trim();
            // ... (rest of your parsing logic is the same)
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
                    synopsis: ''
                });
            }
        });

        console.log(`Finished scrape for URL: ${url}. Found ${stories.length} stories.`);
        return stories;
    } catch (error) {
        console.error(`Error scraping page ${url}:`, error);
        return []; // Return empty array on page-specific error
    } finally {
        // Close the page, but not the whole browser
        if (page !== null) {
            await page.close();
        }
    }
}

module.exports = { scrapeWebsite };