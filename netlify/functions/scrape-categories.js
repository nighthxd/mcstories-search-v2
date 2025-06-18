// netlify/functions/scrape-categories.js
const { scrapeWebsite } = require('./utils/sharedScraperUtils'); // Adjust path as necessary
const { tags } = require('../categories'); // Adjust path as necessary

exports.handler = async (event, context) => {
    const selectedTags = event.queryStringParameters.tags;
    const searchQuery = event.queryStringParameters.query || '';

    if (!selectedTags) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No categories selected' }),
        };
    }

    const tagArray = selectedTags.split(',');

    try {
        const urlsToScrape = tagArray.map(tag => tags[tag]).filter(url => url);

        if (urlsToScrape.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No valid category URLs found' }),
            };
        }

        // Scrape all selected category pages concurrently
        const allStoriesPerTag = await Promise.all(
            urlsToScrape.map(url => scrapeWebsite(url, searchQuery))
        );

        let finalStories = [];

        if (tagArray.length === 1) {
            // If only one tag, just return the stories from that tag
            finalStories = allStoriesPerTag.flat(); // Use flat() as there's only one array within
        } else {
            // For multiple tags, find the intersection of stories
            if (allStoriesPerTag.length > 0) {
                // Start with stories from the first tag (already filtered by keyword if applicable)
                let commonStories = allStoriesPerTag[0];

                // Iterate through the rest of the tag results to find common stories
                for (let i = 1; i < allStoriesPerTag.length; i++) {
                    const currentTagStories = allStoriesPerTag[i];
                    // Filter commonStories to only include those whose titles exist in currentTagStories
                    commonStories = commonStories.filter(story =>
                        currentTagStories.some(s => s.title === story.title)
                    );
                    // If at any point commonStories becomes empty, no intersection exists, break early
                    if (commonStories.length === 0) break;
                }
                finalStories = commonStories;
            }
        }

        // Ensure uniqueness (though intersection logic should largely handle this)
        const uniqueFinalStories = [];
        const seenTitles = new Set();
        finalStories.forEach(story => {
            if (!seenTitles.has(story.title)) {
                seenTitles.add(story.title);
                uniqueFinalStories.push(story);
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify(uniqueFinalStories),
        };
    } catch (error) {
        console.error("Error in scrape-categories function handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error occurred while scraping' }),
        };
    }
};