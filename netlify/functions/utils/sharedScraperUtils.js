// netlify/functions/utils/sharedScraperUtils.js
const axios = require('axios');
const cheerio = require('cheerio');
const excludedLinks = require('../../../excludedLinks'); // Ensure this path is correct

async function scrapeWebsite(url, searchQuery = '') {
    console.log(`Starting scrapeWebsite for URL: ${url} with query: ${searchQuery}`);

    try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);

        let stories = [];

        // --- CHANGE THIS LINE to be specific to story links ---
        // FROM: $('a[href^=\"../Stories/\"]').each((i, element) => {
        // TO:
        $('a[href$="/index.html"]').each((i, element) => {
        // --- END CHANGE ---
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
                
                // We're no longer scraping synopsis here to prevent timeouts
                // It will be fetched on demand by a new function
                stories.push({ 
                    title, 
                    link: fullLink, 
                    categories: categories, 
                    synopsis: '' // Initially empty synopsis
                });
            }
        });

        console.log(`Finished scrapeWebsite for URL: ${url}. Found ${stories.length} stories.`);
        return stories; // stories now includes an empty synopsis placeholder
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return [];
    }
}

module.exports = { scrapeWebsite };