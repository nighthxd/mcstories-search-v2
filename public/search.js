// search.js

document.addEventListener('DOMContentLoaded', () => {
    // Optional: Implement theme toggle logic if needed
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            // Save preference to localStorage if desired
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'light');
            }
        });

        // Apply saved theme on load
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
        }
    }
});


async function handleSearchClick() {
    const searchInput = document.getElementById('search-input');
    const query = searchInput.value.trim();
    const resultsContainer = document.getElementById('results-container');

    // Clear previous results
    resultsContainer.innerHTML = 'Loading results...';

    // Collect selected 'include' tags
    const includeCheckboxes = document.querySelectorAll('input[name="include_tag"]:checked');
    const includedTags = Array.from(includeCheckboxes).map(cb => cb.value);

    // Collect selected 'exclude' tags
    const excludeCheckboxes = document.querySelectorAll('input[name="exclude_tag"]:checked');
    const excludedTags = Array.from(excludeCheckboxes).map(cb => cb.value);

    // Construct the query string for the Netlify function
    let queryString = '';
    if (includedTags.length > 0) {
        queryString += `tags=${includedTags.join(',')}`;
    }
    if (excludedTags.length > 0) {
        // Add '&' if tags are already present, otherwise start with 'exclude_tags'
        queryString += `${queryString ? '&' : ''}exclude_tags=${excludedTags.join(',')}`;
    }
    if (query) {
        // Add '&' if any tags are already present
        queryString += `${queryString ? '&' : ''}query=${encodeURIComponent(query)}`;
    }

    // Determine which Netlify function to call
    // If no tags are selected but a query exists, use 'scrape' for a broader search on the main site.
    // Otherwise, use 'scrape-categories' for tag-specific searches.
    let endpoint = '/.netlify/functions/scrape-categories';
    if (!includedTags.length && !excludedTags.length && query) {
        // If only a search query and no category filters, use the general scrape function
        // Note: You might need to adjust your 'scrape' function to handle query-only searches effectively if it currently assumes all URLs from 'searchall'.
        endpoint = '/.netlify/functions/scrape';
    } else if (!includedTags.length && !excludedTags.length && !query) {
        // Handle case where no filters are selected, maybe return all or show message
        resultsContainer.innerHTML = '<p>Please select categories, enter a search term, or both.</p>';
        return;
    }


    const fetchUrl = `${endpoint}?${queryString}`;
    console.log('Fetching:', fetchUrl); // For debugging

    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const stories = await response.json();

        resultsContainer.innerHTML = ''; // Clear "Loading results..."

        if (stories.length === 0) {
            resultsContainer.innerHTML = '<p>No stories found matching your criteria.</p>';
        } else {
            const ul = document.createElement('ul');
            stories.forEach(story => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = story.url; // Use story.url from the backend
                a.textContent = story.title;
                a.target = "_blank"; // Open in new tab

                li.appendChild(a);

                // Display categories if available
                if (story.categories && story.categories.length > 0) {
                    const categoriesSpan = document.createElement('span');
                    categoriesSpan.className = 'story-categories';
                    categoriesSpan.textContent = ` (${story.categories.join(', ').toLowerCase()})`;
                    li.appendChild(categoriesSpan);
                }

                ul.appendChild(li);
            });
            resultsContainer.appendChild(ul);
        }

    } catch (error) {
        console.error('Error fetching stories:', error);
        resultsContainer.innerHTML = '<p>Error loading stories. Please try again later.</p>';
    }
}