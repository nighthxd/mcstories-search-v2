// netlify/functions/scrape.js (or wherever your functions are)
const { scrapeWebsite } = require('./utils/sharedScraperUtils'); // Adjust path as necessary
const { searchall } = require('../../categories'); // Adjust path as necessary

exports.handler = async (event, context) => {
    const searchQuery = event.queryStringParameters.query || '';

    try {
        // Create an array of promises, each representing a scrape operation
        const scrapePromises = searchall.map(url => scrapeWebsite(url, searchQuery));

        // Wait for all promises to resolve concurrently
        const resultsPerUrl = await Promise.all(scrapePromises);

        // Flatten the array of arrays into a single array of stories
        let allStories = resultsPerUrl.flat();

        // Remove duplicates based on title
        const uniqueStories = [];
        const seenTitles = new Set();
        allStories.forEach(story => {
            if (!seenTitles.has(story.title)) {
                seenTitles.add(story.title);
                uniqueStories.push(story);
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify(uniqueStories),
        };
    } catch (error) {
        console.error("Error in scrape function handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error occurred while scraping' }),
        };
    }
};