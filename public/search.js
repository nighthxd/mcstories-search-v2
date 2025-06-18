// search.js
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'light');
            }
        });

        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
        }
    }
});

async function handleSearchClick() {
    const searchInput = document.getElementById('search-input');
    const query = searchInput.value.trim();
    const resultsContainer = document.getElementById('results-container');

    resultsContainer.innerHTML = 'Loading results...';

    const includeCheckboxes = document.querySelectorAll('input[name="include_tag"]:checked');
    const includedTags = Array.from(includeCheckboxes).map(cb => cb.value);

    const excludeCheckboxes = document.querySelectorAll('input[name="exclude_tag"]:checked');
    const excludedTags = Array.from(excludeCheckboxes).map(cb => cb.value);

    let apiUrl;
    let fetchOptions = {};

    if (includedTags.length > 0 || excludedTags.length > 0) {
        apiUrl = '/.netlify/functions/scrape-categories?';
        const params = new URLSearchParams();
        if (query) {
            params.append('query', query);
        }
        if (includedTags.length > 0) {
            params.append('categories', includedTags.join(','));
        }
        if (excludedTags.length > 0) {
            params.append('excludedCategories', excludedTags.join(','));
        }
        apiUrl += params.toString();
        fetchOptions.method = 'GET';
    } else {
        apiUrl = '/.netlify/functions/scrape?';
        fetchOptions.method = 'POST';
        fetchOptions.headers = {
            'Content-Type': 'application/json',
        };
        fetchOptions.body = JSON.stringify({ query: query });
    }

    try {
        const response = await fetch(apiUrl, fetchOptions);

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
                const storyHeader = document.createElement('div');
                storyHeader.className = 'story-header';

                const a = document.createElement('a');
                a.href = story.url;
                a.textContent = story.title;
                a.target = "_blank";
                storyHeader.appendChild(a);

                if (story.categories && story.categories.length > 0) {
                    const categoriesSpan = document.createElement('span');
                    categoriesSpan.className = 'story-categories';
                    categoriesSpan.textContent = ` (${story.categories.join(', ').toLowerCase()})`;
                    storyHeader.appendChild(categoriesSpan);
                }
                li.appendChild(storyHeader);

                const synopsisDiv = document.createElement('div');
                synopsisDiv.className = 'story-synopsis';
                synopsisDiv.textContent = story.synopsis || 'Loading synopsis...';
                synopsisDiv.style.display = 'none';
                li.appendChild(synopsisDiv);

                const toggleButton = document.createElement('button');
                toggleButton.className = 'toggle-synopsis';
                toggleButton.textContent = 'Show Synopsis';
                toggleButton.setAttribute('data-synopsis-loaded', story.synopsis && story.synopsis !== 'Loading synopsis...' ? 'true' : 'false');
                toggleButton.onclick = async () => {
                    if (synopsisDiv.style.display === 'block') {
                        synopsisDiv.style.display = 'none';
                        toggleButton.textContent = 'Show Synopsis';
                    } else {
                        synopsisDiv.style.display = 'block';
                        toggleButton.textContent = 'Hide Synopsis';

                        if (toggleButton.getAttribute('data-synopsis-loaded') === 'false') {
                            try {
                                const synopsisResponse = await fetch(`/.netlify/functions/get-synopsis?url=${encodeURIComponent(story.url)}`);
                                if (!synopsisResponse.ok) {
                                    throw new Error(`HTTP error! status: ${synopsisResponse.status}`);
                                }
                                const data = await synopsisResponse.json();
                                synopsisDiv.textContent = data.synopsis || 'Failed to retrieve synopsis.';
                                toggleButton.setAttribute('data-synopsis-loaded', 'true');
                            } catch (synopsisError) {
                                console.error('Error fetching synopsis:', synopsisError);
                                synopsisDiv.textContent = 'Error loading synopsis. Please try again.';
                            }
                        }
                    }
                };
                li.appendChild(toggleButton);

                // Removed the "Read Story" button as the title is already a link
                // const readMoreButton = document.createElement('button');
                // readMoreButton.className = 'read-more-button';
                // readMoreButton.textContent = 'Read Story';
                // readMoreButton.onclick = () => {
                //     window.open(story.url, '_blank');
                // };
                // li.appendChild(readMoreButton);

                ul.appendChild(li);
            });
            resultsContainer.appendChild(ul);
        }

    } catch (error) {
        console.error('Error fetching stories:', error);
        resultsContainer.innerHTML = '<p>Error loading stories. Please try again later.</p>';
    }
}