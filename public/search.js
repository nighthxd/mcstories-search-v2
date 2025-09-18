// search.js
document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle logic
    const themeToggle = document.getElementById('theme-toggle');
    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
        });
    }
});

async function handleSearchClick() {
    const searchInput = document.getElementById('search-input');
    const query = searchInput.value.trim();
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = 'Loading results...';

    const includedTags = Array.from(document.querySelectorAll('input[name="include_tag"]:checked')).map(cb => cb.value);
    
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (includedTags.length > 0) params.append('categories', includedTags.join(','));
    
    const apiUrl = `/.netlify/functions/scrape-categories?${params.toString()}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const stories = await response.json();

        resultsContainer.innerHTML = ''; 

        if (stories.length === 0) {
            resultsContainer.innerHTML = '<p>No stories found in the database matching your criteria.</p>';
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

                if (story.synopsis && story.synopsis.trim().length > 0) {
                    const synopsisDiv = document.createElement('div');
                    synopsisDiv.className = 'story-synopsis';
                    synopsisDiv.textContent = story.synopsis;
                    synopsisDiv.style.display = 'none';
                    li.appendChild(synopsisDiv);

                    const toggleButton = document.createElement('button');
                    toggleButton.className = 'toggle-synopsis';
                    toggleButton.textContent = 'Show Synopsis';
                    
                    toggleButton.onclick = () => {
                        const isHidden = synopsisDiv.style.display === 'none';
                        synopsisDiv.style.display = isHidden ? 'block' : 'none';
                        toggleButton.textContent = isHidden ? 'Hide Synopsis' : 'Show Synopsis';
                    };
                    
                    // This line was missing
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