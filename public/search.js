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

    // Clear previous results and show loading message
    resultsContainer.innerHTML = 'Loading results...';

    // Collect selected 'include' tags
    const includeCheckboxes = document.querySelectorAll('input[name="include_tag"]:checked');
    const includedTags = Array.from(includeCheckboxes).map(cb => cb.value);

    // Collect selected 'exclude' tags
    const excludeCheckboxes = document.querySelectorAll('input[name="exclude_tag"]:checked');
    const excludedTags = Array.from(excludeCheckboxes).map(cb => cb.value);

    try {
        const response = await fetch('/.netlify/functions/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, includedTags, excludedTags }),
        });

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
                // Added a div for story-header to contain title and categories for better flex control
                const storyHeader = document.createElement('div');
                storyHeader.className = 'story-header';

                const a = document.createElement('a');
                a.href = story.url;
                a.textContent = story.title;
                a.target = "_blank"; // Open in new tab
                storyHeader.appendChild(a);

                // Display categories if available
                if (story.categories && story.categories.length > 0) {
                    const categoriesSpan = document.createElement('span');
                    categoriesSpan.className = 'story-categories';
                    categoriesSpan.textContent = ` (${story.categories.join(', ').toLowerCase()})`;
                    storyHeader.appendChild(categoriesSpan);
                }
                li.appendChild(storyHeader);

                // Add synopsis and toggle button if synopsis exists
                if (story.synopsis) {
                    const synopsisDiv = document.createElement('div');
                    synopsisDiv.className = 'story-synopsis';
                    synopsisDiv.textContent = story.synopsis;
                    li.appendChild(synopsisDiv);

                    const toggleButton = document.createElement('button');
                    toggleButton.className = 'toggle-synopsis';
                    toggleButton.textContent = 'Show Synopsis';
                    toggleButton.onclick = () => {
                        synopsisDiv.style.display = synopsisDiv.style.display === 'block' ? 'none' : 'block';
                        toggleButton.textContent = synopsisDiv.style.display === 'block' ? 'Hide Synopsis' : 'Show Synopsis';
                    };
                    li.appendChild(toggleButton);
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

// NEW: Function to handle data refresh
async function handleRefreshClick() {
    const resultsContainer = document.getElementById('results-container');
    const originalContent = resultsContainer.innerHTML; // Store original content

    resultsContainer.innerHTML = '<p>Refreshing data... This may take a moment.</p>';
    
    try {
        // Call your Netlify scrape function to update the database
        const response = await fetch('/.netlify/functions/scrape', {
            method: 'POST', // Assuming your scrape function accepts POST
            headers: {
                'Content-Type': 'application/json',
            },
            // You might send a flag or specific data if your scrape function needs it
            body: JSON.stringify({ refresh: true }), 
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();
        console.log('Scrape successful:', data);
        resultsContainer.innerHTML = '<p>Data refresh complete! You can now perform a new search.</p>';
        // Optionally, you might want to automatically trigger a search here,
        // or clear the message after a few seconds.
        setTimeout(() => {
            resultsContainer.innerHTML = originalContent; // Restore previous content or clear
            // If you want to automatically search after refresh:
            // handleSearchClick(); 
        }, 3000); 

    } catch (error) {
        console.error('Error refreshing data:', error);
        resultsContainer.innerHTML = `<p>Error refreshing data: ${error.message}. Please try again later.</p>`;
    }
}