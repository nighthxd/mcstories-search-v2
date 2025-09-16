// netlify/functions/scrape-categories.js

exports.handler = async (event, context) => {
    // This function now forwards the request to your Cloudflare Worker API
    try {
        const params = new URLSearchParams(event.queryStringParameters);
        const apiUrl = `${process.env.CLOUDFLARE_WORKER_URL}/search?${params.toString()}`;

        console.log(`Forwarding category search to: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            headers: {
                'X-CUSTOM-AUTH-KEY': process.env.NETLIFY_TO_CLOUDFLARE_SECRET,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Cloudflare Worker failed: ${response.status} ${errorText}`);
        }

        const stories = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(stories),
        };

    } catch (error) {
        console.error("Error in scrape-categories handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};