// netlify/functions/scrape-category-by-schedule.js
const cheerio = require('cheerio');
const { tags } = require('../../categories');

async function scrapeUrlWithCloudflare(url) {
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/v1/scrape`;
    // --- NEW DEBUGGING LOGS ---
    console.log("--- Verifying Environment Variables ---");
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId) {
        console.error("2 CRITICAL: CLOUDFLARE_ACCOUNT_ID environment variable is NOT SET.");
    } else {
        console.log(`2 Cloudflare Account ID Loaded: ${accountId}`);
        console.log(`2 Cloudflare URL: ${endpoint}`);
    }

    if (!apiToken) {
        console.error("2 CRITICAL: CLOUDFLARE_API_TOKEN environment variable is NOT SET.");
    } else {
        console.log(`2 Cloudflare API Token Loaded: Length=${apiToken.length}, Preview=${apiToken.substring(0, 4)}...${apiToken.substring(apiToken.length - 4)}`);
    }
    console.log("------------------------------------");
    // --- END DEBUGGING LOGS ---

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to scrape ${url}. Status: ${response.status}, Details: ${errorText}`);
    }

    const { result } = await response.json();
    return result.html;
}

exports.handler = async () => {
    // --- NEW DEBUGGING LOGS ---
    console.log("--- Verifying Environment Variables ---");
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId) {
        console.error("CRITICAL: CLOUDFLARE_ACCOUNT_ID environment variable is NOT SET.");
    } else {
        console.log(`Cloudflare Account ID Loaded: ${accountId}`);
    }

    if (!apiToken) {
        console.error("CRITICAL: CLOUDFLARE_API_TOKEN environment variable is NOT SET.");
    } else {
        console.log(`Cloudflare API Token Loaded: Length=${apiToken.length}, Preview=${apiToken.substring(0, 4)}...${apiToken.substring(apiToken.length - 4)}`);
    }
    console.log("------------------------------------");
    // --- END DEBUGGING LOGS ---

    try {
        const categoryKeys = Object.keys(tags);
        const randomIndex = Math.floor(Math.random() * categoryKeys.length);
        const categoryToScrape = categoryKeys[randomIndex];
        const urlToScrape = tags[categoryToScrape];

        console.log(`Starting scheduled scrape for category: [${categoryToScrape.toUpperCase()}]`);

        const mainHtml = await scrapeUrlWithCloudflare(urlToScrape);
        const $ = cheerio.load(mainHtml);
        const storiesOnPage = [];
        $('a[href$="/index.html"]').each((i, element) => {
            try {
                const title = $(element).text().trim();
                const link = $(element).attr('href');
                if (title && link) {
                    const fullLink = new URL(link, urlToScrape).href;
                    if (!fullLink.includes('/Authors/') && !fullLink.includes('/Tags/')) {
                        const categoriesTd = $(element).parent('td').next('td');
                        const categories = categoriesTd.text().trim().split(' ').filter(cat => cat.length > 0);
                        storiesOnPage.push({ title, link: fullLink, categories });
                    }
                }
            } catch (e) {
                console.warn(`Skipping invalid link.`);
            }
        });

        if (storiesOnPage.length === 0) {
            console.log("No stories found on index page. Exiting.");
            return { statusCode: 200, body: 'No stories found.' };
        }

        const storiesWithData = storiesOnPage.map(story => ({ ...story, synopsis: '' }));

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