// netlify/functions/scrape-category-by-schedule.js
const cheerio = require('cheerio');
const { tags } = require('../../categories');

// Helper function to call the Cloudflare Browser Rendering API
async function scrapeUrlWithCloudflare(url) {
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;

    // --- THIS IS THE FIX: Using the correct API endpoint ---
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/scrape`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to scrape ${url}. Status: ${response.status}, Details: ${errorText}`);
    }

    // The new endpoint returns the HTML directly as the response text
    return await response.text();
}

// Helper function to parse a synopsis from HTML
function getSynopsisFromHtml(html) {
    const $ = cheerio.load(html);
    const storyContentDiv = $('section.synopsis, div#storytext').first();
    if (storyContentDiv.length > 0) {
        let rawSynopsis = storyContentDiv.find('p').first().text().trim() || storyContentDiv.text().trim();
        let synopsis = rawSynopsis.replace(/\s+/g, ' ').substring(0, 1000);
        if (rawSynopsis.length > 1000) synopsis += '...';
        return synopsis;
    }
    return 'Synopsis not available.';
}

exports.handler = async () => {
    try {
        const categoryKeys = Object.keys(tags);
        const randomIndex = Math.floor(Math.random() * categoryKeys.length);
        const categoryToScrape = categoryKeys[randomIndex];
        const urlToScrape = tags[categoryToScrape];

        console.log(`Starting scheduled scrape for category: [${categoryToScrape.toUpperCase()}]`);

        // 1. Scrape the main category page to get story links
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

        // 2. Scrape each story's synopsis in parallel
        console.log(`Found ${storiesOnPage.length} stories. Fetching synopses...`);
        const synopsisPromises = storiesOnPage.map(story =>
            scrapeUrlWithCloudflare(story.link).then(synopsisHtml => {
                story.synopsis = getSynopsisFromHtml(synopsisHtml);
                return story;
            })
        );
        const storiesWithData = await Promise.all(synopsisPromises);

        // 3. Send the scraped data to our Cloudflare Worker to be saved in D1
        console.log(`Sending ${storiesWithData.length} stories to Cloudflare Worker...`);
        const cfWorkerResponse = await fetch(`${process.env.CLOUDFLARE_WORKER_URL}/save-stories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CUSTOM-AUTH-KEY': process.env.NETLIFY_TO_CLOUDFLARE_SECRET,
            },
            body: JSON.stringify(storiesWithData),
        });

        if (!cfWorkerResponse.ok) {
            const errorText = await cfWorkerResponse.text();
            throw new Error(`Cloudflare Worker failed: ${cfWorkerResponse.status} ${errorText}`);
        }

        const result = await cfWorkerResponse.json();
        console.log('Successfully sent data to Cloudflare Worker:', result);
        return { statusCode: 200, body: 'Scrape and save successful.' };

    } catch (error) {
        console.error("Error in scheduled scrape handler:", error);
        return { statusCode: 500, body: error.message };
    }
};