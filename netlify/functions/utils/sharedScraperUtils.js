// netlify/functions/utils/sharedScraperUtils.js
const axios = require('axios');
const cheerio = require('cheerio');
const excludedLinks = require('../../../excludedLinks');

async function scrapeWebsite(url, searchQuery = '') {
    console.log(`Starting scrapeWebsite for URL: ${url} with query: ${searchQuery}`);

    try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);

        let stories = [];
        // --- CHANGE THIS LINE ---
        // FROM: $('a[href^="../Stories/"]').each((i, element) => {
        // TO:
        $('a[href$="/index.html"]').each((i, element) => {
        // --- END CHANGE ---
            const title = $(element).text().trim();
            const link = $(element).attr('href');
            const fullLink = new URL(link, url).href;

            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);
            // Re-adding this for completeness, though still commented out for current test
            const matchesQuery = searchQuery === '' || title.toLowerCase().includes(searchQuery.toLowerCase());

            const categories = [];
            // Assuming categories are in the next 'td' or a sibling element as per the snippet
            const parentTd = $(element).parent('td'); // Get the parent <td> of the <a>
            const categoriesTd = parentTd.next('td'); // Get the next <td> sibling
            if (categoriesTd.length > 0) {
                const categoryText = categoriesTd.text().trim();
                // Split by space and filter out empty strings
                const extractedCats = categoryText.split(' ').filter(cat => cat.length > 0);
                categories.push(...extractedCats); // Add all extracted categories
            }

            console.log(`Scraped story: "${title}", URL: "${fullLink}", Categories:`, categories);

            // Ensure matchesQuery is still commented out if you're testing without query
            if (title && link && !isAuthorOrTagPage && !isExcluded /* && matchesQuery */) {
                stories.push({ title, link: fullLink, categories: categories });
            }
        });

        console.log(`Finished scrapeWebsite for URL: ${url}. Found ${stories.length} stories.`);
        return stories;
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return [];
    }
}

module.exports = { scrapeWebsite };