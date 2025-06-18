// sharedScraperUtils.js
const axios = require('axios');
const cheerio = require('cheerio');
const excludedLinks = require('./excludedLinks'); // Assuming this path is correct relative to functions

/**
 * Scrapes a given URL and extracts story titles and links.
 * Filters out author/tag pages and excluded links.
 * Optionally filters by a search query.
 * @param {string} url The URL to scrape.
 * @param {string} searchQuery Optional keyword to filter titles by.
 * @returns {Array<Object>} An array of story objects with title and link.
 */
async function scrapeWebsite(url, searchQuery = '') {
    try {
        const { data } = await axios.get(url, { timeout: 10000 }); // Add a timeout
        const $ = cheerio.load(data);

        let stories = [];
        $('a').each((i, element) => {
            const title = $(element).text().trim();
            const link = $(element).attr('href');

            // Ensure link is not null or undefined before proceeding
            if (!link) {
                return;
            }

            const fullLink = new URL(link, url).href;

            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);
            const matchesQuery = searchQuery === '' || title.toLowerCase().includes(searchQuery.toLowerCase());

            if (title && !isAuthorOrTagPage && !isExcluded && matchesQuery) {
                stories.push({ title, link: fullLink });
            }
        });

        return stories;
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message); // Log error message for clarity
        // Depending on error, you might want to throw or return an empty array.
        // Returning empty array allows Promise.all to continue.
        return [];
    }
}

module.exports = { scrapeWebsite };