// search.js
// Global map to store fetched synopses to avoid refetching
const fetchedSynopses = new Map();

// Corrected mapping for category short codes to full names from index.html labels
const categoryNames = {
    'bd': 'bondage',
    'be': 'bestiality',
    'ca': 'cannibalism',
    'cb': 'super-hero/heroine',
    'ds': 'dom and/or sub',
    'ex': 'exhibitionism',
    'fd': 'female dominant',
    'ff': 'female/female sex',
    'ft': 'fetish (usually clothing)',
    'fu': 'furry',
    'gr': 'growth/enlargement',
    'hm': 'humiliation',
    'hu': 'humor',
    'in': 'incest',
    'la': 'lactation',
    'ma': 'masturbation',
    'mc': 'mind control',
    'md': 'male dominant',
    'mf': 'male/female sex',
    'mm': 'male/male sex',
    'nc': 'non-consensual',
    'rb': 'robots',
    'sc': 'scatology',
    'sf': 'science fiction',
    'ts': 'time stop',
    'ws': 'watersports'
};

// Function to toggle synopsis visibility and fetch if not already loaded
async function toggleSynopsis(buttonElement, storyLink, synopsisContainerId) {
    const synopsisContainer = document.getElementById(synopsisContainerId);

    // If synopsis is currently visible, hide it
    if (synopsisContainer.style.display === 'block') { // Check current display style
        synopsisContainer.style.display = 'none'; // Hide it
        buttonElement.textContent = 'Show Synopsis';
        return;
    }

    // If synopsis is not visible, show/fetch it
    buttonElement.textContent = 'Loading Synopsis...'; // Provide feedback

    if (fetchedSynopses.has(storyLink)) {
        // Synopsis already fetched, just display it
        synopsisContainer.innerHTML = `<p>${fetchedSynopses.get(storyLink)}</p>`;
        synopsisContainer.style.display = 'block'; // Show it
        buttonElement.textContent = 'Hide Synopsis';
    } else {
        // Fetch synopsis for the first time
        try {
            const response = await fetch(`/.netlify/functions/get-synopsis?url=${encodeURIComponent(storyLink)}`);
            
            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`Backend get-synopsis function failed with status ${response.status}:`, errorBody);
                synopsisContainer.innerHTML = `<p class="error">Error fetching synopsis (Backend issue: ${response.status}).</p>`;
                buttonElement.textContent = 'Show Synopsis'; // Reset button text on error
                return;
            }

            const data = await response.json();
            const synopsisContent = data.synopsis || 'Synopsis not available.';
            fetchedSynopses.set(storyLink, synopsisContent); // Store it in cache
            synopsisContainer.innerHTML = `<p>${synopsisContent}</p>`;
            synopsisContainer.style.display = 'block'; // Show it
            buttonElement.textContent = 'Hide Synopsis';
        } catch (error) {
            console.error("Error fetching synopsis:", error);
            synopsisContainer.innerHTML = '<p class="error">Error loading synopsis. Please try again.</p>';
            buttonElement.textContent = 'Show Synopsis'; // Reset button text on error
        }
    }
}

// Unified function to perform the actual backend fetch and render results
async function executeSearch(searchInput, selectedCategories) {
    const resultsContainer = document.getElementById('results-container');
    // The initial clearing and loading message is handled by handleSearchClick

    let url = '';
    
    // Determine which backend endpoint to call based on input
    if (searchInput && selectedCategories.length > 0) {
        // Keyword AND Categories search
        url = `/.netlify/functions/scrape-categories?tags=${selectedCategories.join(',')}&query=${searchInput}`;
    } else if (searchInput && selectedCategories.length === 0) {
        // Keyword ONLY search
        url = `/.netlify/functions/scrape?query=${searchInput}`;
    } else if (!searchInput && selectedCategories.length > 0) {
        // Category ONLY search (this path will now only be hit if selectedCategories.length > 1)
        url = `/.netlify/functions/scrape-categories?tags=${selectedCategories.join(',')}&query=`; // query is empty
    } else {
        // This case should ideally be caught by handleSearchClick, but as a fallback:
        resultsContainer.innerHTML = '<p>Please enter a keyword or select at least one category.</p>';
        return;
    }

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Backend function failed with status ${response.status}:`, errorBody);
            resultsContainer.innerHTML = `<p class="error">Error occurred while searching (Backend issue: ${response.status}). Please try again later or refine your search.</p>`;
            return;
        }

        const stories = await response.json();

        if (stories.length > 0) {
            resultsContainer.innerHTML = ''; // Clear loading message before displaying results
            stories.forEach((story, index) => {
                const resultItem = document.createElement('div');
                resultItem.classList.add('result-item');
                
                // Generate a unique ID for the synopsis container for this story
                const synopsisContainerId = `synopsis-item-${index}`; 

                resultItem.innerHTML = `
                    <h3>${story.title}</h3>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <button class="toggle-synopsis-btn" data-story-link="${story.link}" data-synopsis-id="${synopsisContainerId}">Show Synopsis</button>
                        <a href="${story.link}" target="_blank" class="read-more-btn">Read more</a>
                    </div>
                    <div id="${synopsisContainerId}" class="synopsis-container"></div> `;
                resultsContainer.appendChild(resultItem);
            });

            // Attach event listeners to the "Show/Hide Synopsis" buttons
            document.querySelectorAll('.toggle-synopsis-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    const storyLink = event.target.dataset.storyLink;
                    const synopsisId = event.target.dataset.synopsisId;
                    toggleSynopsis(event.target, storyLink, synopsisId); // Pass the button element
                });
            });

        } else {
            resultsContainer.innerHTML = '<p>No results found.</p>';
        }
    } catch (error) {
        console.error("Fetch/JSON parsing error in executeSearch:", error);
        resultsContainer.innerHTML = '<p class="error">Error occurred while searching. Please check your network connection or try again.</p>';
    }
}

// Main handler for the search button click
function handleSearchClick() {
    const searchInput = document.getElementById('search-input').value.toLowerCase();
    const resultsContainer = document.getElementById('results-container');
    const searchButton = document.getElementById('search-button'); // Get button reference

    const selectedCategories = [];
    document.querySelectorAll('.categories input[type="checkbox"]:checked').forEach(checkbox => {
        selectedCategories.push(checkbox.id);
    });

    if (!searchInput && selectedCategories.length === 0) {
        resultsContainer.innerHTML = '<p>Please enter a keyword or select at least one category.</p>';
        return;
    }

    // NEW LOGIC for single category without search input
    if (!searchInput && selectedCategories.length === 1) {
        const categoryId = selectedCategories[0];
        const categoryName = categoryNames[categoryId.toLowerCase()] || categoryId; // Fallback if name not found, use ID itself
        const categoryUrl = `https://mcstories.com/Tags/${categoryId}.html`;
        resultsContainer.innerHTML = `
            <div class="result-item single-category-result">
                <h3>Category: ${categoryId.toUpperCase()} - ${categoryName} 
                    <a href="${categoryUrl}" target="_blank" class="read-more-btn">Go to Category</a>
                </h3>
            </div>
        `;
        // Reset button state and stop further execution
        if (searchButton) {
            searchButton.textContent = 'Search';
            searchButton.disabled = false;
        }
        return; // Stop the function here as we've handled this case
    }


    // Show loading feedback
    if (searchButton) {
        searchButton.textContent = 'Searching...';
        searchButton.disabled = true;
    }
    resultsContainer.innerHTML = '<div class="loading-bar"></div><p>Searching...</p>'; // Add loading bar and text

    // Call the unified executeSearch function and ensure button state is reset
    executeSearch(searchInput, selectedCategories).finally(() => {
        if (searchButton) {
            searchButton.textContent = 'Search';
            searchButton.disabled = false;
        }
    });
}

// --- Dark Mode Toggle Logic ---
const themeToggleBtn = document.getElementById('theme-toggle');

// Function to set theme based on a boolean (true for dark, false for light)
function setTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
}

// Chck for saved theme preference on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setTheme(savedTheme === 'dark');
    } else {
        // Default to light mode if no preference saved or first visit
        setTheme(false); 
    }
});

// Event listener for the theme toggle button
if (themeToggleBtn) { // Check if the button exists before adding listener
    themeToggleBtn.addEventListener('click', () => {
        // Toggle the theme based on the current body class
        setTheme(!document.body.classList.contains('dark-mode'));
    });
}

// --- REMOVED AUTOMATIC SEARCH ON CATEGORY CHANGE ---
// The following block has been removed to stop searches from triggering
// automatically when category checkboxes are changed:
/*
document.querySelectorAll('.categories input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', handleSearchClick);
});
*/