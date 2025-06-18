// netlify/functions/utils/sharedScraperUtils.js
const axios = require('axios');
const cheerio = require('cheerio');
const excludedLinks = require('../../../excludedLinks'); // Ensure this path is correct

async function scrapeWebsite(url, searchQuery = '') {
    console.log(`Starting scrapeWebsite for URL: ${url} with query: ${searchQuery}`);

    try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);

        const storyPromises = []; // Array to hold promises for each story's details

        // --- CHANGE THIS LINE ---\
        // FROM: $('a[href^=\"../Stories/\"]').each((i, element) => {
        // TO:\
        $('a[href$="/index.html"]').each((i, element) => {
        // --- END CHANGE ---\
            const title = $(element).text().trim();
            const link = $(element).attr('href');
            const fullLink = new URL(link, url).href;

            const isAuthorOrTagPage = fullLink.includes('https://mcstories.com/Authors') || fullLink.includes('https://mcstories.com/Tags/');
            const isExcluded = excludedLinks.has(fullLink);

            if (title && link && !isAuthorOrTagPage && !isExcluded) {
                // For each valid story link, create a promise to fetch its page and extract synopsis
                storyPromises.push((async () => {
                    let synopsis = '';
                    try {
                        const storyPageResponse = await axios.get(fullLink, { timeout: 5000 }); // Shorter timeout for individual story
                        const $$ = cheerio.load(storyPageResponse.data); // Use $$ to avoid conflict with outer $

                        // Attempt to extract synopsis from the story text.
                        // Common selectors for synopsis/story body on mcstories.com:
                        // #storytext, .panel-body, or initial <p> tags within main content.
                        const storyContentDiv = $$('#storytext, .panel-body').first(); // Get the first matching element
                        if (storyContentDiv.length > 0) {
                            // Take the text content of the first few paragraphs or a limited length
                            // For simplicity, let's grab the text of the first <p> tag inside, or directly from the div.
                            let rawSynopsis = storyContentDiv.find('p').first().text().trim();
                            if (!rawSynopsis) { // If no <p> inside, get text directly from the div
                                rawSynopsis = storyContentDiv.text().trim();
                            }

                            // Limit synopsis length and clean up extra newlines/spaces
                            synopsis = rawSynopsis.substring(0, 500).replace(/\s+/g, ' '); // Limit to 500 chars, collapse whitespace
                            if (rawSynopsis.length > 500) {
                                synopsis += '...'; // Add ellipsis if truncated
                            }
                        }
                    } catch (storyError) {
                        console.error(`Error scraping synopsis for ${fullLink}:`, storyError.message);
                        synopsis = 'Error fetching synopsis.'; // Indicate failure
                    }

                    const categories = [];
                    const parentTd = $(element).parent('td');
                    const categoriesTd = parentTd.next('td');
                    if (categoriesTd.length > 0) {
                        const categoryText = categoriesTd.text().trim();
                        const extractedCats = categoryText.split(' ').filter(cat => cat.length > 0);
                        categories.push(...extractedCats);
                    }

                    return { title, link: fullLink, categories: categories, synopsis: synopsis };
                })());
            }
        });

        // Wait for all individual story scraping promises to resolve
        const stories = await Promise.all(storyPromises);

        console.log(`Finished scrapeWebsite for URL: ${url}. Found ${stories.length} stories.`);
        return stories; // stories now includes synopsis
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return [];
    }
}

module.exports = { scrapeWebsite };