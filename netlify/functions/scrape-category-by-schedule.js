// netlify/functions/scrape-category-by-schedule.js
const cheerio = require('cheerio');
const { tags } = require('../../categories');

// 1. Helper function to introduce a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to scrape a URL using Cloudflare Browser Rendering
async function scrapeUrlWithCloudflare(urlToScrape, elementSelectors) {
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/scrape`;

    const urlData = {
        url: urlToScrape,
        elements: elementSelectors,
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(urlData),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to scrape ${urlToScrape}. Status: ${response.status}, Details: ${errorText}`);
    }

    const json = await response.json();

    if (!json.result || !Array.isArray(json.result) || json.result.length === 0) {
        console.error("Cloudflare scrape raw response:", JSON.stringify(json, null, 2));
        throw new Error(`Cloudflare scrape returned no usable data for ${urlToScrape}`);
    }

    return json.result.flatMap(r => r.results || []);
}

// Main handler for the scheduled function
exports.handler = async () => {
    try {
        const categoryKeys = Object.keys(tags);
        const randomIndex = Math.floor(Math.random() * categoryKeys.length);
        const categoryToScrape = categoryKeys[randomIndex];
        const urlToScrape = tags[categoryToScrape];

        console.log(`Starting scheduled scrape for category: [${categoryToScrape.toUpperCase()}] from ${urlToScrape}`);

        const indexSelectors = [{ selector: "tr" }];
        const indexResults = await scrapeUrlWithCloudflare(urlToScrape, indexSelectors);

        const storiesOnPage = [];
        indexResults.forEach(item => {
            try {
                const $ = cheerio.load(item.html);
                const a = $('a');
                if (a.length > 0) {
                    const title = a.find('cite').text().trim() || a.text().trim();
                    const link = new URL(a.attr('href'), urlToScrape).href;
                    const text = item.text || '';
                    const parts = text.split('\t');
                    const categories = parts.length > 1 ? parts[1].split(' ').filter(Boolean) : [];

                    if (title && link && !link.includes('/Authors/') && !link.includes('/Tags/')) {
                        storiesOnPage.push({ title, link, categories });
                    }
                }
            } catch (e) {
                console.warn(`Skipping invalid snippet from index page: ${e.message}`);
            }
        });

        if (storiesOnPage.length === 0) {
            console.log("No stories found on index page. Exiting.");
            return { statusCode: 200, body: 'No stories found on the index page.' };
        }

        console.log(`Found ${storiesOnPage.length} stories on index page. Now fetching synopses...`);

        const storiesWithData = [];
        for (const story of storiesOnPage) {
            try {
                console.log(`Scraping synopsis for: ${story.title}`);
                const synopsisSelector = [{ selector: "hr + p" }]; 
                const storyPageResults = await scrapeUrlWithCloudflare(story.link, synopsisSelector);

                let synopsis = '';
                if (storyPageResults.length > 0 && storyPageResults[0].text) {
                    synopsis = storyPageResults[0].text.trim();
                } else {
                    console.warn(`Synopsis not found for: ${story.title}`);
                }

                storiesWithData.push({
                    ...story,
                    synopsis: synopsis
                });

            } catch (error) {
                console.error(`Failed to scrape synopsis for ${story.title} at ${story.link}:`, error);
                storiesWithData.push({
                    ...story,
                    synopsis: '' 
                });
            }

            // 2. PAUSE for 5 seconds before the next request
            console.log('Waiting 5 seconds...');
            await delay(5000); 
        }
        
        console.log(`Sending ${storiesWithData.length} stories with synopses to Cloudflare Worker...`);
        const response = await fetch(`${process.env.CLOUDFLARE_WORKER_URL}/save-stories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CUSTOM-AUTH-KEY': process.env.NETLIFY_TO_CLOUDFLARE_SECRET,
            },
            body: JSON.stringify(storiesWithData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Cloudflare Worker failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        console.log('Successfully sent data to Cloudflare Worker:', result);
        return { statusCode: 200, body: 'Scrape and save successful.' };

    } catch (error) {
        console.error("Error in scheduled scrape handler:", error);
        return { statusCode: 500, body: error.message };
    }
};