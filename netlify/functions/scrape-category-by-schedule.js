// netlify/functions/scrape-category-by-schedule.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const { tags } = require('../../categories');

// Utility to scrape a single story's synopsis
async function scrapeSynopsisPage(browser, storyUrl) {
    let page = null;
    try {
        page = await browser.newPage();
        await page.goto(storyUrl, { waitUntil: 'networkidle0', timeout: 20000 });
        const data = await page.content();
        const $ = cheerio.load(data);
        const storyContentDiv = $('section.synopsis, div#storytext').first();
        if (storyContentDiv.length > 0) {
            let rawSynopsis = storyContentDiv.find('p').first().text().trim() || storyContentDiv.text().trim();
            let synopsis = rawSynopsis.replace(/\s+/g, ' ').substring(0, 1000);
            if (rawSynopsis.length > 1000) synopsis += '...';
            return synopsis;
        }
        return 'Synopsis not available.';
    } catch (e) {
        console.error(`Timeout or error scraping synopsis for ${storyUrl}:`, e.message);
        return 'Synopsis could not be retrieved.';
    } finally {
        if (page) await page.close();
    }
}

exports.handler = async () => {
    let browser = null;
    try {
        // Note: This function no longer tracks state. It just scrapes a random category.
        // A stateful approach would require another API call.
        const categoryKeys = Object.keys(tags);
        const randomIndex = Math.floor(Math.random() * categoryKeys.length);
        const categoryToScrape = categoryKeys[randomIndex];
        const urlToScrape = tags[categoryToScrape];

        console.log(`Starting scheduled scrape for category: [${categoryToScrape.toUpperCase()}]`);

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const mainPage = await browser.newPage();
        await mainPage.goto(urlToScrape, { waitUntil: 'networkidle0' });
        const mainHtml = await mainPage.content();
        await mainPage.close();

        const $ = cheerio.load(mainHtml);
        const storiesOnPage = [];
        $('a[href$="/index.html"]').each((i, element) => {
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
        });
        
        console.log(`Found ${storiesOnPage.length} stories. Fetching synopses...`);
        const synopsisPromises = storiesOnPage.map(story =>
            scrapeSynopsisPage(browser, story.link).then(synopsis => {
                story.synopsis = synopsis;
                return story;
            })
        );
        const storiesWithData = await Promise.all(synopsisPromises);

        // Send the scraped data to the Cloudflare Worker
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
        return { statusCode: 200, body: 'Scrape and send successful.' };

    } catch (error) {
        console.error("Error in scheduled scrape handler:", error);
        return { statusCode: 500, body: error.message };
    } finally {
        if (browser) await browser.close();
    }
};