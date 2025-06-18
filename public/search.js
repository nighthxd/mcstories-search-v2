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

    const includeCheckboxes = document.querySelectorAll('input[name=\"include_tag\"]:checked');
    const includedTags = Array.from(includeCheckboxes).map(cb => cb.value);

    const excludeCheckboxes = document.querySelectorAll('input[name=\"exclude_tag\"]:checked');
    const excludedTags = Array.from(excludeCheckboxes).map(cb => cb.value);

    let apiUrl = includedTags.length > 0 || excludedTags.length > 0
        ? '/.netlify/functions/scrape-categories?'
        : '/.netlify/functions/scrape?';

    const params = new URLSearchParams();
    if (query) {
        params.append('query', query);
    }
    if (includedTags.length > 0) {
        params.append('tags', includedTags.join(','));
    }
    if (excludedTags.length > 0) {
        params.append('exclude_tags', excludedTags.join(','));
    }

    apiUrl += params.toString();

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const stories = await response.json();

        resultsContainer.innerHTML = '';

        if (stories.length === 0) {
            resultsContainer.innerHTML = '<p>No stories found matching your criteria.</p>';
        } else {
            const ul = document.createElement('ul');
            stories.forEach(story => {
                const li = document.createElement('li');
                li.className = 'story-item'; // Add class for styling

                const headerDiv = document.createElement('div');
                headerDiv.className = 'story-header';

                const a = document.createElement('a');
                a.href = story.url;
                a.textContent = story.title;
                a.target = "_blank";

                headerDiv.appendChild(a);

                if (story.categories && story.categories.length > 0) {
                    const categoriesSpan = document.createElement('span');
                    categoriesSpan.className = 'story-categories';
                    categoriesSpan.textContent = ` (${story.categories.join(', ').toLowerCase()})`;
                    headerDiv.appendChild(categoriesSpan);
                }
                li.appendChild(headerDiv);

                // Synopsis display area
                const synopsisDiv = document.createElement('div');
                synopsisDiv.className = 'story-synopsis';
                // Initially, display a placeholder or the empty synopsis if available from DB
                synopsisDiv.textContent = story.synopsis || 'Synopsis: Content not available yet.'; 
                li.appendChild(synopsisDiv);

                // Show Synopsis Button
                const toggleButton = document.createElement('button');
                toggleButton.className = 'toggle-synopsis';
                toggleButton.textContent = 'Show Synopsis';
                toggleButton.setAttribute('data-synopsis-loaded', 'false'); // Custom attribute to track load state
                toggleButton.onclick = async () => {
                    if (synopsisDiv.style.display === 'block') {
                        synopsisDiv.style.display = 'none';
                        toggleButton.textContent = 'Show Synopsis';
                    } else {
                        synopsisDiv.style.display = 'block';
                        toggleButton.textContent = 'Hide Synopsis';

                        // Fetch synopsis only if not already loaded or if it's the initial placeholder
                        if (toggleButton.getAttribute('data-synopsis-loaded') === 'false' || 
                            synopsisDiv.textContent === 'Synopsis: Content not available yet.') {
                            synopsisDiv.textContent = 'Loading synopsis...'; // Show loading state
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

                // Read More button
                const readMoreButton = document.createElement('button');
                readMoreButton.className = 'read-more-button';
                readMoreButton.textContent = 'Read Story';
                readMoreButton.onclick = () => {
                    window.open(story.url, '_blank');
                };
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