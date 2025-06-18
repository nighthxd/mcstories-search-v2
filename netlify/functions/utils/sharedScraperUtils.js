// netlify/functions/utils/sharedScraperUtils.js
const axios = require('axios');
const cheerio = require('cheerio');
const excludedLinks = require('../../excludedLinks'); // Ensure this path is correct

async function scrapeWebsite(url, searchQuery = '') {
    try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);

        let stories = [];
        // Target <a> tags that link to individual stories
        $('a[href^="../Stories/"]').each((i, element) => {
            const title = $(element).text().trim();
            const link = $(element).attr('href');
            const fullLink = new URL(link, url).href; // Resolve relative links to full URLs

            // Filter out author/tag index pages and explicitly excluded links
            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);
            const matchesQuery = searchQuery === '' || title.toLowerCase().includes(searchQuery.toLowerCase());

            // Extract categories
            const categories = [];
            // Categories are typically in a div.storyCodes right after the <a> tag
            const storyCodesDiv = $(element).nextAll('.storyCodes').first();
            if (storyCodesDiv.length > 0) {
                storyCodesDiv.find('a').each((j, catElement) => {
                    // Extract category short codes (e.g., 'mc', 'in') from the href
                    const catLink = $(catElement).attr('href');
                    const match = catLink.match(/\/Tags\/([a-z0-9]+)\.html/i);
                    if (match && match[1]) {
                        categories.push(match[1]); // Store the short code (e.g., 'mc')
                    }
                });
            }

            if (title && link && !isAuthorOrTagPage && !isExcluded && matchesQuery) {
                stories.push({ title, link: fullLink, categories: categories }); // Include categories
            }
        });

        return stories;
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return [];
    }
}

module.exports = { scrapeWebsite };