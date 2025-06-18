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
        $('a[href^="../Stories/"]').each((i, element) => {
            const title = $(element).text().trim();
            const link = $(element).attr('href');
            const fullLink = new URL(link, url).href;

            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);
            // --- REMOVE OR COMMENT OUT THIS LINE ---
            // const matchesQuery = searchQuery === '' || title.toLowerCase().includes(searchQuery.toLowerCase());
            // --- AND THIS PART OF THE IF CONDITION ---

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

            console.log(`Scraped story: "${title}", URL: "${fullLink}", Categories:`, categories);

            // Modified if condition: removed '&& matchesQuery'
            if (title && link && !isAuthorOrTagPage && !isExcluded) {
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