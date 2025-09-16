// netlify/functions/get-synopsis.js

exports.handler = async (event, context) => {
    try {
        const storyUrl = event.queryStringParameters.url;
        if (!storyUrl) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing story URL parameter.' }) };
        }

        const params = new URLSearchParams({ url: storyUrl });
        const apiUrl = `${process.env.CLOUDFLARE_WORKER_URL}/synopsis?${params.toString()}`;
        
        console.log(`Forwarding synopsis request to: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            headers: {
                'X-CUSTOM-AUTH-KEY': process.env.NETLIFY_TO_CLOUDFLARE_SECRET,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Cloudflare Worker failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };
    } catch (error) {
        console.error("Error in get-synopsis handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};