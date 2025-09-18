# MCStories Search - Netlify Frontend & Scraper

This repository contains the Netlify-specific components of the MCStories Search project. It provides the user interface, handles client-side search logic, and includes Netlify Functions for proxying requests to the Cloudflare Worker backend and for scheduled web scraping.

## Project Components (Netlify)

The Netlify part of this project is responsible for the user-facing application and the scheduled scraping operations.

*   **`index.html`**: The main user interface for the search engine. It features a search bar, category filters (for both including and excluding tags like bondage, bestiality, mind control, and science fiction), and a container to display search results dynamically [6]. It also includes important disclaimers [6].
*   **`style-sheet.css`**: Provides the styling for the frontend, ensuring a clean, responsive user experience. It supports a dark mode theme and includes general layout and element-specific styles [8].
*   **`search.js`**: This JavaScript file manages user interactions on the frontend. It collects search queries and selected category filters, then sends these requests to the Netlify backend. Upon receiving results, it dynamically renders the stories on the page, including titles, links, categories, and a toggleable synopsis for each story [7].
*   **`netlify/functions/scrape-category-by-schedule.js`**: A scheduled serverless function that periodically scrapes a random category from `mcstories.com` using Cloudflare Browser Rendering. It extracts story titles, links, categories, and synopses, then sends this data to the Cloudflare Worker for storage [11]. This function utilizes `cheerio` for HTML parsing and is scheduled to run every hour [5, 3].
*   **`netlify/functions/scrape-categories.js`**: An API endpoint that acts as a proxy between the frontend (`search.js`) and the Cloudflare Worker's search endpoint. It forwards search queries and category filters to the Cloudflare Worker and returns the results to the client [10].
*   **`netlify/functions/scrape.js`**: Another Netlify API endpoint that forwards simple search queries to the Cloudflare Worker's search endpoint. It ensures secure communication using a custom authentication key [9].
*   **`netlify.toml`**: The configuration file for Netlify, defining the project's build settings, the location of serverless functions, and crucially, the cron schedule for the `scrape-category-by-schedule` function [5].
*   **`categories.js`**: Contains static data, specifically mappings of category tags to their corresponding URLs on `mcstories.com`, which are used by the scraping functions [2].
*   **`package.json`**: (Specifically for the Netlify functions) Lists the project's dependencies, including `cheerio` for HTML parsing in the scraping functions [3].

## Netlify Setup

To deploy and run the Netlify components of this project:

1.  **Create a New Site**: In your Netlify account, create a "New site from Git" and link it to your forked GitHub repository. The default build settings should typically suffice [12].

2.  **Set Environment Variables**: Navigate to your Netlify site settings under **Site configuration > Environment variables** and add the following:
    *   `CLOUDFLARE_WORKER_URL`: The URL of your deployed Cloudflare Worker (e.g., `https://mcstories-worker.your-subdomain.workers.dev`). This URL is obtained after deploying your Cloudflare Worker [12].
    *   `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID, which can be found on your main Cloudflare dashboard [12].
    *   `CLOUDFLARE_API_TOKEN`: A Cloudflare API token with `Account.Browser Rendering` > `Read` permissions. This is necessary for the scheduled scraper to utilize Cloudflare's browser rendering service [12].
    *   `NETLIFY_TO_CLOUDFLARE_SECRET`: A secure, random string that you create (e.g., using a password generator). This secret is used to authenticate requests between your Netlify Functions and your Cloudflare Worker, ensuring secure communication [12].

## Final Deployment

Once you have set up your Netlify site and configured the environment variables, pushing changes from your local machine to the `main` branch of your forked repository on GitHub will automatically trigger a new deployment on Netlify. The scheduled scraper will begin running based on the schedule defined in `netlify.toml` (every hour), and your search engine will be live [12].