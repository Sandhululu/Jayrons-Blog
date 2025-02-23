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
});

// 🎭 **Fix: Category Filtering Now Works Correctly**
function filterPosts(category) {
    currentCategory = category; // Store selected category
    let posts = document.querySelectorAll(".post");

    posts.forEach(post => {
        let belongsToCategory = post.classList.contains(category) || category === "all";
        post.style.display = belongsToCategory ? "block" : "none";
    });

    // ✅ Ensure rating filter applies after category selection
    filterByRating();
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

