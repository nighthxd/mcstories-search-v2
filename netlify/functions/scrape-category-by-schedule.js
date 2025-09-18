// netlify/functions/scrape-category-by-schedule.js
const cheerio = require('cheerio');
const { tags } = require('../../categories');

async function scrapeUrlWithCloudflare(urlToScrape) {
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/scrape`;

    const elementsSelector = [
        { selector: "tr" } // scrape each table row
    ];

    const urlData = {
        url: urlToScrape,
        elements: elementsSelector,
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

exports.handler = async () => {
    try {
        const categoryKeys = Object.keys(tags);
        const randomIndex = Math.floor(Math.random() * categoryKeys.length);
        const categoryToScrape = categoryKeys[randomIndex];
        const urlToScrape = tags[categoryToScrape];

        console.log(`Starting scheduled scrape for category: [${categoryToScrape.toUpperCase()}]`);

        // Get structured results from Cloudflare
        const results = await scrapeUrlWithCloudflare(urlToScrape);

        const storiesOnPage = [];
        results.forEach(item => {
            try {
                const $ = cheerio.load(item.html);
                const a = $('a');
                if (a.length > 0) {
                    // Title comes from <cite> if available, else from anchor text
                    const title = a.find('cite').text().trim() || a.text().trim();
                    const link = new URL(a.attr('href'), urlToScrape).href;

                    // Categories from the "text" field after the first tab
                    const text = item.text || '';
                    const parts = text.split('\t');
                    const categories = parts.length > 1
                        ? parts[1].split(' ').filter(Boolean)
                        : [];

                    if (title && link) {
                        // Skip author/tag links
                        if (!link.includes('/Authors/') && !link.includes('/Tags/')) {
                            storiesOnPage.push({ title, link, categories });
                        }
                    }
                }
            } catch (e) {
                console.warn(`Skipping invalid snippet: ${e.message}`);
            }
        });

        if (storiesOnPage.length === 0) {
            console.log("No stories found on index page. Exiting.");
            return { statusCode: 200, body: 'No stories found.' };
        }

        const storiesWithData = storiesOnPage.map(story => ({
            ...story,
            synopsis: ''
        }));

        console.log(`Sending ${storiesWithData.length} stories to Cloudflare Worker...`);
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
