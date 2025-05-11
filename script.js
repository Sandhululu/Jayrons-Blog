document.addEventListener("DOMContentLoaded", function () {
    let searchInput = document.getElementById("searchInput");
    let ratingFilter = document.getElementById("ratingFilter");
    let sortFilter = document.getElementById("sortFilter");
    let filterButtons = document.querySelectorAll("nav button");
    let blogPostsContainer = document.getElementById("blog-posts");
    let darkModeToggle = document.getElementById("darkModeToggle");

    let currentCategory = "all"; // Default category

    // ✅ Ensure category buttons apply filtering
    filterButtons.forEach(button => {
        button.addEventListener("click", function () {
            let category = this.getAttribute("onclick").replace("filterPosts('", "").replace("')", "");
            filterPosts(category);
        });
    });

    // ✅ Search bar event listener
    if (searchInput) searchInput.addEventListener("keyup", searchPosts);

    // ✅ Rating filter event listener
    if (ratingFilter) ratingFilter.addEventListener("change", filterByRating);

    // ✅ Sorting event listener
    if (sortFilter) sortFilter.addEventListener("change", sortPostsByDate);

    // ✅ Apply initial sorting
    sortPostsByDate();

    // ✅ Load Dark Mode from `localStorage`
    if (localStorage.getItem("darkMode") === "enabled") {
        enableDarkMode();
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener("click", function () {
            document.body.classList.toggle("dark-mode");
            document.querySelector("header").classList.toggle("dark-mode");
            document.querySelectorAll(".post").forEach(post => post.classList.toggle("dark-mode"));

            if (document.body.classList.contains("dark-mode")) {
                localStorage.setItem("darkMode", "enabled");
            } else {
                localStorage.setItem("darkMode", "disabled");
            }
        });
    }

    // ✅ Load saved ratings
    document.querySelectorAll(".rating").forEach(rating => {
        let postId = rating.getAttribute("data-post");
        let savedRating = localStorage.getItem(postId) || 0;
        let lastUpdated = localStorage.getItem(postId + "-lastUpdated") || "Never";
        let savedNotes = localStorage.getItem(postId + "-notes") || "";

        let stars = rating.querySelectorAll(".star");
        updateStarDisplay(stars, savedRating);

        let lastUpdatedElem = document.getElementById("lastUpdated-" + postId);
        if (lastUpdatedElem) lastUpdatedElem.textContent = "Last Updated: " + lastUpdated;

        let notesElem = document.getElementById("notes-" + postId);
        if (notesElem) notesElem.value = savedNotes;

        stars.forEach(star => {
            star.addEventListener("click", function () {
                let value = this.getAttribute("data-value");
                let now = new Date().toLocaleString();

                localStorage.setItem(postId, value);
                localStorage.setItem(postId + "-lastUpdated", now);

                updateStarDisplay(stars, value);

                if (lastUpdatedElem) lastUpdatedElem.textContent = "Last Updated: " + now;
            });
        });

        stars.forEach(star => {
            star.addEventListener("mouseover", function () {
                updateStarDisplay(stars, this.getAttribute("data-value"));
            });

            star.addEventListener("mouseout", function () {
                updateStarDisplay(stars, localStorage.getItem(postId) || 0);
            });
        });
    });

    // Add event listener for when new book reviews are added
    if (blogPostsContainer) {
        const observer = new MutationObserver((mutations) => {
            // If we're currently showing books, recalculate the word count
            if (currentCategory === "books") {
                calculateTotalWordCount();
            }
        });

        // Start observing the container for changes
        observer.observe(blogPostsContainer, {
            childList: true, // Watch for added/removed posts
            subtree: true    // Watch all descendants
        });
    }
});

// 🎭 **Fix: Category Filtering Now Works Correctly**
function filterPosts(category) {
    currentCategory = category; // Store selected category
    let posts = document.querySelectorAll(".post");
    let wordCountContainer = document.getElementById("wordCountContainer");
    let restaurantFilters = document.getElementById("restaurantFilters");
    let ratingFilter = document.getElementById("ratingFilter");
    let sortFilter = document.getElementById("sortFilter");

    // Show/hide word count container based on category
    if (category === "books") {
        wordCountContainer.style.display = "block";
        calculateTotalWordCount();
    } else {
        wordCountContainer.style.display = "none";
    }

    // Show/hide restaurant filters and rating/sort filters
    if (category === "restaurants") {
        restaurantFilters.style.display = "block";
        if (ratingFilter) ratingFilter.style.display = "none";
        if (sortFilter) sortFilter.style.display = "none";
        populateRestaurantFilters();
        filterRestaurants();
    } else {
        restaurantFilters.style.display = "none";
        if (ratingFilter) ratingFilter.style.display = "inline-block";
        if (sortFilter) sortFilter.style.display = "inline-block";
    }

    posts.forEach(post => {
        let belongsToCategory = post.classList.contains(category) || category === "all";
        post.style.display = belongsToCategory ? "block" : "none";
    });

    // ✅ Ensure rating filter applies after category selection
    if (category !== "restaurants") filterByRating();
}

// 📚 Calculate total word count for book reviews
async function calculateTotalWordCount() {
    let totalWords = 0;
    let bookPosts = document.querySelectorAll(".post.books");
    
    for (let post of bookPosts) {
        let link = post.querySelector("a").href;
        try {
            const response = await fetch(link);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/html");
            
            // Look for the word count paragraph
            const paragraphs = doc.querySelectorAll("p");
            for (let p of paragraphs) {
                if (p.textContent.includes("📚 Total Words:")) {
                    // Extract the number from the text
                    const wordCountText = p.textContent;
                    const wordCount = parseInt(wordCountText.replace(/[^0-9]/g, '')) || 0;
                    totalWords += wordCount;
                    break;
                }
            }
        } catch (error) {
            console.error("Error fetching word count for:", link, error);
        }
    }
    
    // Update the display with the total
    const wordCountDisplay = document.getElementById("totalWordCount");
    if (wordCountDisplay) {
        wordCountDisplay.textContent = totalWords.toLocaleString();
    }
}

// 🔍 **Fix: Search Now Works for All Posts, Even If `<h2>` is Empty**
function searchPosts() {
    let input = document.getElementById("searchInput").value.toLowerCase();
    let posts = document.querySelectorAll(".post");

    posts.forEach(post => {
        let titleElement = post.querySelector("h2 a");
        let imgElement = post.querySelector("img");
        let title = "";

        if (titleElement && titleElement.textContent.trim() !== "") {
            title = titleElement.textContent.toLowerCase();
        } else if (imgElement && imgElement.alt.trim() !== "") {
            title = imgElement.alt.toLowerCase(); // Fallback to image alt text
        }

        post.style.display = title.includes(input) ? "block" : "none";
    });
}

// ⭐ **Fix: Rating Filtering Works Only Within Selected Category**
function filterByRating() {
    let selectedRating = document.getElementById("ratingFilter").value;
    let posts = document.querySelectorAll(".post");

    posts.forEach(post => {
        let rating = parseFloat(post.getAttribute("data-rating"));
        let postCategory = post.classList.contains(currentCategory) || currentCategory === "all";

        if (!isNaN(rating) && postCategory) {
            post.style.display = selectedRating === "all" || rating >= parseFloat(selectedRating) ? "block" : "none";
        }
    });
}

// 📅 **Fix: Sorting Works Correctly After Filtering**
function sortPostsByDate() {
    let sortOrder = document.getElementById("sortFilter").value;
    let blogPostsContainer = document.getElementById("blog-posts");
    let posts = Array.from(blogPostsContainer.children);

    posts.sort((a, b) => {
        let dateA = new Date(a.getAttribute("data-uploaded"));
        let dateB = new Date(b.getAttribute("data-uploaded"));
        return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    posts.forEach(post => blogPostsContainer.appendChild(post));
}

// ⭐ **Update Star Rating Display**
function updateStarDisplay(stars, rating) {
    stars.forEach(star => {
        let value = star.getAttribute("data-value");
        star.classList.toggle("selected", value <= rating);
    });
}

// ✍ **Save Notes**
function saveNotes(postId) {
    let notes = document.getElementById("notes-" + postId).value;
    localStorage.setItem(postId + "-notes", notes);
    alert("Notes saved!");
}

// 🌙 **Enable Dark Mode**
function enableDarkMode() {
    document.body.classList.add("dark-mode");
    document.querySelector("header").classList.add("dark-mode");
    document.querySelectorAll(".post").forEach(post => post.classList.add("dark-mode"));
}

// Populate city and cuisine dropdowns based on restaurant posts
function populateRestaurantFilters() {
    let citySet = new Set();
    let cuisineSet = new Set();
    let restaurantPosts = document.querySelectorAll(".post.restaurants");
    restaurantPosts.forEach(post => {
        citySet.add(post.getAttribute("data-city"));
        cuisineSet.add(post.getAttribute("data-cuisine"));
    });
    let cityFilter = document.getElementById("cityFilter");
    let cuisineFilter = document.getElementById("cuisineFilter");
    // Clear existing options except 'all'
    cityFilter.innerHTML = '<option value="all">All Cities</option>';
    cuisineFilter.innerHTML = '<option value="all">All Cuisines</option>';
    // Add unique cities/cuisines
    Array.from(citySet).sort().forEach(city => {
        cityFilter.innerHTML += `<option value="${city}">${city}</option>`;
    });
    Array.from(cuisineSet).sort().forEach(cuisine => {
        cuisineFilter.innerHTML += `<option value="${cuisine}">${cuisine}</option>`;
    });
}

// Filter restaurant posts by selected city and cuisine
function filterRestaurants() {
    let city = document.getElementById("cityFilter").value;
    let cuisine = document.getElementById("cuisineFilter").value;
    let rating = document.getElementById("restaurantRatingFilter").value;
    let restaurantPosts = document.querySelectorAll(".post.restaurants");
    restaurantPosts.forEach(post => {
        let matchCity = (city === "all" || post.getAttribute("data-city") === city);
        let matchCuisine = (cuisine === "all" || post.getAttribute("data-cuisine") === cuisine);
        let postRating = parseFloat(post.getAttribute("data-rating"));
        let matchRating = (rating === "all" || (!isNaN(postRating) && postRating >= parseFloat(rating)));
        post.style.display = (matchCity && matchCuisine && matchRating) ? "block" : "none";
    });
}

