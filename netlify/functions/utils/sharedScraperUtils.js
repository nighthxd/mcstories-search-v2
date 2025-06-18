// netlify/functions/utils/sharedScraperUtils.js
const axios = require('axios');
const cheerio = require('cheerio');
const excludedLinks = require('../../excludedLinks');

async function scrapeWebsite(url, searchQuery = '') {
    try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);

        let stories = [];
        $('a[href^="../Stories/"]').each((i, element) => {
            const title = $(element).text().trim();
            const link = $(element).attr('href');
            const fullLink = new URL(link, url).href;

            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);
            const matchesQuery = searchQuery === '' || title.toLowerCase().includes(searchQuery.toLowerCase());

            const categories = [];
            const storyCodesDiv = $(element).nextAll('.storyCodes').first();
            if (storyCodesDiv.length > 0) {
                storyCodesDiv.find('a').each((j, catElement) => {
                    const catLink = $(catElement).attr('href');
                    const match = catLink.match(/\/Tags\/([a-z0-9]+)\.html/i);
                    if (match && match[1]) {
                        categories.push(match[1]);
                    }
                });
            }

            // --- ADD THIS LOG LINE HERE ---
            console.log(`Scraped story: "${title}", URL: "${fullLink}", Categories:`, categories);
            // --- END LOG LINE ---

            if (title && link && !isAuthorOrTagPage && !isExcluded && matchesQuery) {
                stories.push({ title, link: fullLink, categories: categories });
            }
        });

        return stories;
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return [];
    }
}

module.exports = { scrapeWebsite };