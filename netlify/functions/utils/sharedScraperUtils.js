// netlify/functions/utils/sharedScraperUtils.js
const axios = require('axios');
const cheerio = require('cheerio');
const excludedLinks = require('../../../excludedLinks'); // Corrected path

/**
 * Scrapes a given URL and extracts story titles, links, and associated categories.
 * Filters out author/tag pages and excluded links.
 * Optionally filters by a search query.
 * @param {string} url The URL to scrape.
 * @param {string} searchQuery Optional keyword to filter titles by.
 * @returns {Array<Object>} An array of story objects with title, link, and categories.
 */
async function scrapeWebsite(url, searchQuery = '') {
    try {
        const { data } = await axios.get(url, { timeout: 10000 }); // Add a timeout
        const $ = cheerio.load(data);

        let stories = [];
        // The structure on mcstories.com often has stories within specific containers.
        // Assuming stories are typically listed, often within 'p' tags or directly as links.
        // We need to find elements that represent a story entry, then extract its title, link, and storyCodes.
        // A common pattern is a story title link, followed by metadata.
        // Let's refine the selector to target story entries more accurately.
        // Assuming each story entry might be grouped, e.g., in a 'p' tag or a 'div' related to an entry.
        // Based on typical mcstories.com structure, the title link is often followed by storyCodes.
        // We'll iterate through links that represent story titles.

        $('a[href^="../Stories/"]').each((i, element) => { // Target links pointing to stories
            const title = $(element).text().trim();
            const link = $(element).attr('href');

            if (!link) {
                return;
            }

            const fullLink = new URL(link, url).href;

            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);
            const matchesQuery = searchQuery === '' || title.toLowerCase().includes(searchQuery.toLowerCase());

            if (title && !isAuthorOrTagPage && !isExcluded && matchesQuery) {
                const storyObject = { title, link: fullLink };

                // Find the closest parent element that contains both the link and storyCodes div
                // or find the storyCodes div that is a sibling or child of a common parent.
                // Assuming storyCodes often appear directly after the title link's parent paragraph/div,
                // or within a broader story entry container.
                // Let's try to find the storyCodes div relative to the current link element.
                
                // This selector attempts to find a .storyCodes div that is a sibling
                // or child within the same parent as the story link.
                const storyCodesDiv = $(element).nextAll('.storyCodes').first(); 
                
                // If nextAll doesn't work (e.g., if it's in a different parent or previous sibling)
                // you might need to go up to a common ancestor and then look for the storyCodes:
                // const commonAncestor = $(element).closest('.story-entry-class'); // Replace with actual common parent class
                // if (commonAncestor.length > 0) {
                //     storyCodesDiv = commonAncestor.find('.storyCodes').first();
                // }

                const categories = [];
                if (storyCodesDiv.length > 0) {
                    storyCodesDiv.find('a').each((j, catElement) => {
                        categories.push($(catElement).text().trim());
                    });
                }
                storyObject.categories = categories; // Add categories to the story object
                stories.push(storyObject);
            }
        });

        return stories;
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        return [];
    }
}

module.exports = { scrapeWebsite };