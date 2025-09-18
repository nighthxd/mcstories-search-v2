// search.js
document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle logic
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
        }
    }

    // New function to build the category list on page load
    populateCategoryList();
});

function populateCategoryList() {
    const categoryListContainer = document.getElementById('category-list');
    if (!categoryListContainer || typeof tags === 'undefined') {
        return;
    }

    const ul = document.createElement('ul');
    // Sort categories alphabetically by their description (the value)
    const sortedCategories = Object.entries(tags).sort((a, b) => a[1].localeCompare(b[1]));

    sortedCategories.forEach(([tag, description]) => {
        const li = document.createElement('li');
        // We'll use checkboxes for include/exclude in a future step, for now just list them
        li.textContent = description;
        ul.appendChild(li);
    });

    categoryListContainer.appendChild(ul);
}


async function handleSearchClick() {
    const searchInput = document.getElementById('search-input');
    const query = searchInput.value.trim();
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = 'Loading results...';

    // The logic for getting selected categories would go here
    // For now, it remains the same
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    
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