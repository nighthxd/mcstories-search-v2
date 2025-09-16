// netlify/functions/scrape.js

exports.handler = async (event, context) => {
    try {
        const { query } = JSON.parse(event.body || '{}');
        const params = new URLSearchParams({ query: query || '' });
        const apiUrl = `${process.env.CLOUDFLARE_WORKER_URL}/search?${params.toString()}`;

        console.log(`Forwarding simple search to: ${apiUrl}`);

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
        console.error("Error in scrape handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};