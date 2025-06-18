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
        endpoint = '/.netlify/functions/scrape';
    } else if (!includedTags.length && !excludedTags.length && !query) {
        resultsContainer.innerHTML = '<p>Please select categories, enter a search term, or both to see results.</p>';
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

                // Story Header: Title and Categories
                const storyHeader = document.createElement('div');
                storyHeader.className = 'story-header';

                const titleLink = document.createElement('a');
                titleLink.href = story.url;
                titleLink.textContent = story.title;
                titleLink.target = "_blank"; // Open in new tab
                storyHeader.appendChild(titleLink);

                if (story.categories && story.categories.length > 0) {
                    const categoriesSpan = document.createElement('span');
                    categoriesSpan.className = 'story-categories';
                    categoriesSpan.textContent = ` (${story.categories.join(', ').toLowerCase()})`;
                    storyHeader.appendChild(categoriesSpan);
                }
                li.appendChild(storyHeader);

                // Synopsis (placeholder as backend doesn't provide it yet)
                const synopsisDiv = document.createElement('div');
                synopsisDiv.className = 'story-synopsis';
                // Note: The backend does not currently provide synopsis content.
                // This is a placeholder. You would need to modify your Netlify function(s)
                // to scrape and return synopsis content for this to be dynamic.
                synopsisDiv.textContent = 'Synopsis: Content not available yet.';
                li.appendChild(synopsisDiv);

                // Buttons
                const toggleSynopsisButton = document.createElement('button');
                toggleSynopsisButton.className = 'toggle-synopsis';
                toggleSynopsisButton.textContent = 'Show Synopsis';
                toggleSynopsisButton.onclick = () => {
                    if (synopsisDiv.style.display === 'none' || synopsisDiv.style.display === '') {
                        synopsisDiv.style.display = 'block';
                        toggleSynopsisButton.textContent = 'Hide Synopsis';
                    } else {
                        synopsisDiv.style.display = 'none';
                        toggleSynopsisButton.textContent = 'Show Synopsis';
                    }
                };
                li.appendChild(toggleSynopsisButton);

                const readMoreButton = document.createElement('button');
                readMoreButton.className = 'read-more-button';
                readMoreButton.textContent = 'Read More';
                readMoreButton.onclick = () => window.open(story.url, '_blank');
                li.appendChild(readMoreButton);

                ul.appendChild(li);
            });
            resultsContainer.appendChild(ul);
        }

    } catch (error) {
        console.error('Error fetching stories:', error);
        resultsContainer.innerHTML = '<p>Error loading stories. Please try again later.</p>';
    }
}