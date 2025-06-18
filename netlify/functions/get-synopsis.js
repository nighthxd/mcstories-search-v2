// netlify/functions/get-synopsis.js
const axios = require('axios');
const cheerio = require('cheerio');

exports.handler = async (event, context) => {
    const storyUrl = event.queryStringParameters.url;

    if (!storyUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing story URL parameter.' }),
        };
    }

    try {
        console.log(`Attempting to scrape synopsis for: ${storyUrl}`);
        const { data } = await axios.get(storyUrl, { timeout: 5000 }); // Short timeout for single page
        const $ = cheerio.load(data);

        let synopsis = 'Synopsis not available yet.'; // Default placeholder

        // Attempt to extract synopsis from the story text.
        // Common selectors for synopsis/story body on mcstories.com:
        // #storytext, .panel-body, or initial <p> tags within main content.
        const storyContentDiv = $('#storytext, .panel-body').first(); 
        if (storyContentDiv.length > 0) {
            // Take the text content of the first few paragraphs or a limited length
            let rawSynopsis = storyContentDiv.find('p').first().text().trim();
            if (!rawSynopsis) { // If no <p> inside, get text directly from the div
                rawSynopsis = storyContentDiv.text().trim();
            }

            // Limit synopsis length and clean up extra newlines/spaces
            synopsis = rawSynopsis.substring(0, 1000).replace(/\s+/g, ' '); // Limit to 1000 chars, collapse whitespace
            if (rawSynopsis.length > 1000) {
                synopsis += '...'; // Add ellipsis if truncated
            } else if (rawSynopsis.length === 0) {
                synopsis = 'No synopsis found on story page.';
            }
        } else {
            synopsis = 'Could not locate story content on page.';
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ synopsis: synopsis }),
        };

    } catch (error) {
        console.error(`Error scraping synopsis for ${storyUrl}:`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Failed to fetch synopsis for ${storyUrl}.` }),
        };
    }
};