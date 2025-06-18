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

        // --- CORRECTED SELECTOR ---
        // Prioritize 'section.synopsis' as it's directly from the provided HTML.
        // Keep other selectors as fallbacks for different page layouts if they exist.
        const storyContentDiv = $('section.synopsis, div#storytext, div.panel-body, div#content, div.story-content, article.story-article, .main-content-area').first(); 
        // --- END CORRECTED SELECTOR ---

        if (storyContentDiv.length > 0) {
            // Attempt to get text from first paragraph, or directly from the div, then clean up
            let rawSynopsis = storyContentDiv.find('p').first().text().trim();
            if (!rawSynopsis) { 
                // If no <p> inside, or <p> is empty, get text directly from the selected div
                rawSynopsis = storyContentDiv.text().trim();
            }

            // Clean up multiple spaces and newlines, limit length
            synopsis = rawSynopsis.replace(/\s+/g, ' ').substring(0, 1000); 
            if (rawSynopsis.length > 1000) {
                synopsis += '...'; // Add ellipsis if truncated
            } else if (rawSynopsis.length === 0) {
                synopsis = 'No synopsis text found within the identified content area.';
            }
        } else {
            synopsis = 'Could not locate the main story content area on this page (selector mismatch).';
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