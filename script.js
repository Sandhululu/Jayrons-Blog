// === Firebase Anonymous Wishlist Sync ===
// Assumes firebase-app-compat.js and firebase-firestore-compat.js are loaded in index.html
const firebaseConfig = {
    apiKey: "AIzaSyD4-qfOjNKQaQVOMpmOWEyAHGnlXXAI6gA",
    authDomain: "jayrons-blog.firebaseapp.com",
    projectId: "jayrons-blog",
    storageBucket: "jayrons-blog.firebasestorage.app",
    messagingSenderId: "415462374722",
    appId: "1:415462374722:web:2463285dcb962b2df95cdb",
    measurementId: "G-6NENJFX1YY"
};
if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
}
const db = window.firebase.firestore();

// Auth instance
const auth = window.firebase.auth();
let currentUser = null;

let wishlistUserId = localStorage.getItem('wishlistUserId');
if (!wishlistUserId) {
    wishlistUserId = crypto.randomUUID();
    localStorage.setItem('wishlistUserId', wishlistUserId);
}

// Helper to get the correct sync key (user.uid if logged in, else wishlistUserId)
function getSyncKey() {
    return currentUser && currentUser.uid ? currentUser.uid : wishlistUserId;
}

function saveWishlistToCloud() {
    const wishlistState = {};
    document.querySelectorAll('.wishlist-checkbox').forEach((cb, idx) => {
        wishlistState[idx] = cb.checked;
    });
    db.collection('wishlists').doc(getSyncKey()).set(wishlistState);
}

let currentCategory = "all"; // Default category, now global

function updateAuthBtn(user) {
    const authBtn = document.getElementById('authBtn');
    if (!authBtn) return;
    if (user) {
        // Remove the button from the DOM if logged in
        authBtn.parentNode.removeChild(authBtn);
    } else {
        authBtn.textContent = 'Login with Google';
        authBtn.style.display = 'block';
    }
}

document.addEventListener("DOMContentLoaded", async function () {
    let searchInput = document.getElementById("searchInput");
    let ratingFilter = document.getElementById("ratingFilter");
    let sortFilter = document.getElementById("sortFilter");
    let filterButtons = document.querySelectorAll("nav button");
    let blogPostsContainer = document.getElementById("blog-posts");
    let darkModeToggle = document.getElementById("darkModeToggle");

    // ✅ Ensure category buttons apply filtering
    filterButtons.forEach(button => {
        button.addEventListener("click", function () {
            let category = this.getAttribute("data-category");
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

    // Call filterPosts('all') on page load to set default state
    filterPosts('all');

    // Google Auth login/logout logic
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.addEventListener('click', function() {
            if (auth.currentUser) {
                auth.signOut();
            } else {
                const provider = new window.firebase.auth.GoogleAuthProvider();
                auth.signInWithPopup(provider);
            }
        });
    }
    attachAllWishlistListeners();

    // Show My Sync Code button functionality
    const showSyncCodeBtn = document.getElementById('showSyncCodeBtn');
    if (showSyncCodeBtn) {
        showSyncCodeBtn.addEventListener('click', function() {
            window.prompt('Your Sync Code (wishlistUserId):', wishlistUserId);
        });
    }

    // ===== Wishlist Modal Logic =====
    const modalConfig = [
      { btn: 'addBookBtn', modal: 'addBookModal' },
      { btn: 'addMovieBtn', modal: 'addMovieModal' },
      { btn: 'addGameBtn', modal: 'addGameModal' },
      { btn: 'addRestaurantBtn', modal: 'addRestaurantModal' },
      { btn: 'addTvShowBtn', modal: 'addTvShowModal' }
    ];
    modalConfig.forEach(({ btn, modal }) => {
      const button = document.getElementById(btn);
      const modalEl = document.getElementById(modal);
      if (button && modalEl) {
        button.addEventListener('click', () => {
          modalEl.classList.add('show');
        });
      }
      // Close modal on close button click
      if (modalEl) {
        const closeBtn = modalEl.querySelector('.wishlist-modal-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modalEl.classList.remove('show');
          });
        }
        // Close modal when clicking outside modal content
        modalEl.addEventListener('mousedown', (e) => {
          if (e.target === modalEl) {
            modalEl.classList.remove('show');
          }
        });
      }
    });
    // Show/hide 'Other' section for Book modal
    const bookGenreSelect = document.getElementById('bookGenreSelect');
    const bookOtherSection = document.getElementById('bookOtherSectionContainer');
    if (bookGenreSelect && bookOtherSection) {
      bookGenreSelect.addEventListener('change', function() {
        if (this.value === 'new-section') {
          bookOtherSection.style.display = '';
        } else {
          bookOtherSection.style.display = 'none';
        }
      });
    }
    // Show/hide 'Other' section for Game modal
    const gameGenreSelect = document.getElementById('gameGenreSelect');
    const gameOtherSection = document.getElementById('gameOtherSectionContainer');
    if (gameGenreSelect && gameOtherSection) {
      gameGenreSelect.addEventListener('change', function() {
        if (this.value === 'new-section') {
          gameOtherSection.style.display = '';
        } else {
          gameOtherSection.style.display = 'none';
        }
      });
    }

    // Wishlist Add Restaurant Modal logic
    const restaurantLocationSelect = document.getElementById('restaurantLocationSelect');
    const restaurantNewLocationContainer = document.getElementById('restaurantNewLocationContainer');
    const restaurantNewLocationInput = document.getElementById('restaurantNewLocationInput');
    const restaurantCuisineSelect = document.getElementById('restaurantCuisineSelect');
    const restaurantNewCuisineContainer = document.getElementById('restaurantNewCuisineContainer');
    const restaurantNewCuisineInput = document.getElementById('restaurantNewCuisineInput');

    if (restaurantLocationSelect && restaurantNewLocationContainer) {
      restaurantLocationSelect.addEventListener('change', function () {
        restaurantNewLocationContainer.style.display = this.value === 'new-location' ? '' : 'none';
      });
    }
    if (restaurantCuisineSelect && restaurantNewCuisineContainer) {
      restaurantCuisineSelect.addEventListener('change', function () {
        restaurantNewCuisineContainer.style.display = this.value === 'new-cuisine' ? '' : 'none';
      });
    }

    // Add Post Modal logic
    // Add button to open modal
    const addPostBtn = document.createElement('button');
    addPostBtn.id = 'openAddPostModalBtn';
    addPostBtn.className = 'wishlist-action-btn';
    addPostBtn.textContent = 'Add Post';
    const blogPosts = document.getElementById('blog-posts');
    // Only add the Add Post button if we are NOT in restaurants or wishlists section
    if (blogPosts && blogPosts.parentNode && !window.location.pathname.includes('restaurants') && !window.location.pathname.includes('wishlist')) {
      blogPosts.parentNode.insertBefore(addPostBtn, blogPosts);
    }
    const addPostModal = document.getElementById('addPostModal');
    const closeAddPostModal = document.getElementById('closeAddPostModal');
    addPostBtn.addEventListener('click', () => {
      addPostModal.classList.add('show');
    });
    closeAddPostModal.addEventListener('click', () => {
      addPostModal.classList.remove('show');
    });
    addPostModal.addEventListener('mousedown', (e) => {
      if (e.target === addPostModal) addPostModal.classList.remove('show');
    });
    // Section switching logic
    const sectionSelect = document.getElementById('postSectionSelect');
    const sectionFields = {
      books: document.getElementById('postFieldsBooks'),
      movies: document.getElementById('postFieldsMovies'),
      tvshows: document.getElementById('postFieldsTVShows'),
      games: document.getElementById('postFieldsGames')
    };
    sectionSelect.addEventListener('change', function() {
      Object.keys(sectionFields).forEach(key => {
        sectionFields[key].style.display = (key === this.value) ? '' : 'none';
      });
    });
    // Cloudinary upload widget
    const uploadBtn = document.getElementById('uploadPostImageBtn');
    const imageUrlInput = document.getElementById('postImageUrlInput');
    const imagePreview = document.getElementById('postImagePreview');
    uploadBtn.addEventListener('click', function() {
      if (!window.cloudinary) {
        alert('Cloudinary widget not loaded.');
        return;
      }
      cloudinary.openUploadWidget({
        cloudName: 'dultavuvg', // <-- Replace with your Cloudinary cloud name
        uploadPreset: 'blog_unsigned', // <-- Replace with your unsigned upload preset
        sources: ['local', 'url', 'camera'],
        multiple: false,
        cropping: false
      }, function(error, result) {
        if (!error && result && result.event === "success") {
          imageUrlInput.value = result.info.secure_url;
          imagePreview.src = result.info.secure_url;
          imagePreview.style.display = 'block';
        }
      });
    });
    // Submit logic (now save to Firestore and render post)
    document.getElementById('submitAddPost').addEventListener('click', async function() {
      const section = sectionSelect.value;
      let postData = {
        section,
        imageUrl: imageUrlInput.value,
        description: document.getElementById('postDescription').value.trim(),
        created: new Date()
      };
      if (section === 'books') {
        postData.title = document.getElementById('postBookTitle').value.trim();
        postData.author = document.getElementById('postBookAuthor').value.trim();
        postData.genre = document.getElementById('postBookGenre').value.trim();
        postData.readingTime = document.getElementById('postBookReadingTime').value.trim();
        postData.totalWords = document.getElementById('postBookTotalWords').value.trim();
        postData.rating = document.getElementById('postBookRating').value.trim();
      } else if (section === 'movies') {
        postData.title = document.getElementById('postMovieTitle').value.trim();
        postData.director = document.getElementById('postMovieDirector').value.trim();
        postData.genre = document.getElementById('postMovieGenre').value.trim();
        postData.watchedOn = document.getElementById('postMovieWatchedOn').value.trim();
        postData.rating = document.getElementById('postMovieRating').value.trim();
      } else if (section === 'tvshows') {
        postData.title = document.getElementById('postTVShowTitle').value.trim();
        postData.genre = document.getElementById('postTVShowGenre').value.trim();
        postData.finishedOn = document.getElementById('postTVShowFinishedOn').value.trim();
        postData.rating = document.getElementById('postTVShowRating').value.trim();
      } else if (section === 'games') {
        postData.title = document.getElementById('postGameTitle').value.trim();
        postData.developer = document.getElementById('postGameDeveloper').value.trim();
        postData.genre = document.getElementById('postGameGenre').value.trim();
        postData.releaseDate = document.getElementById('postGameReleaseDate').value.trim();
        postData.rating = document.getElementById('postGameRating').value.trim();
      }
      try {
        const docRef = await db.collection('posts').add(postData);
        postData.id = docRef.id;
        renderBlogPostCard(postData);
        alert('Post added successfully!');
        if (section === 'books') {
          calculateTotalWordCount();
        }
      } catch (e) {
        alert('Error adding post: ' + e.message);
      }
      addPostModal.classList.remove('show');
      // Optionally reset fields here
    });

    // Initialize Firestore listener only once
    if (!window.postsListenerInitialized) {
      window.postsListenerInitialized = true;
      initializePostsListener();
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
    let wishlistSection = document.getElementById("wishlist-section");
    let blogPostsContainer = document.getElementById("blog-posts");
    let filterSortContainer = document.getElementById("filter-sort-container");
    let mainRestaurantListSection = document.getElementById("main-restaurant-list-section");
    const addPostBtn = document.getElementById('openAddPostModalBtn'); // Get the add post button

    // Wishlist mode
    if (category === "wishlist") {
        if (wishlistSection) wishlistSection.classList.add("show");
        if (blogPostsContainer) blogPostsContainer.style.display = "none";
        if (restaurantFilters) restaurantFilters.style.display = "none";
        if (ratingFilter) ratingFilter.style.display = "none";
        if (sortFilter) sortFilter.style.display = "none";
        if (filterSortContainer) filterSortContainer.style.display = "none";
        if (wordCountContainer) wordCountContainer.style.display = "none";
        if (mainRestaurantListSection) mainRestaurantListSection.style.display = "none";
        if (addPostBtn) addPostBtn.style.display = "none"; // Hide add post button in wishlist
        return;
    } else {
        if (wishlistSection) wishlistSection.classList.remove("show");
        if (blogPostsContainer) blogPostsContainer.style.display = "";
        if (ratingFilter) ratingFilter.style.display = "inline-block";
        if (sortFilter) sortFilter.style.display = "inline-block";
        if (filterSortContainer) filterSortContainer.style.display = "block";
        if (addPostBtn) addPostBtn.style.display = "block"; // Show add post button in main blog view
    }

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
        if (filterSortContainer) filterSortContainer.style.display = "none";
        populateRestaurantFilters();
        filterRestaurants();
        if (mainRestaurantListSection) mainRestaurantListSection.style.display = "block";
        posts.forEach(post => post.style.display = "none");
        if (addPostBtn) addPostBtn.style.display = "none"; // Hide add post button in restaurants
    } else {
        restaurantFilters.style.display = "none";
        if (ratingFilter) ratingFilter.style.display = "inline-block";
        if (sortFilter) sortFilter.style.display = "inline-block";
        if (filterSortContainer) filterSortContainer.style.display = "block";
        if (mainRestaurantListSection) mainRestaurantListSection.style.display = "none";
    posts.forEach(post => {
        let belongsToCategory = post.classList.contains(category) || category === "all";
            post.style.display = belongsToCategory ? "" : "none";
    });
        if (category !== "restaurants") filterByRating();
    }
}

// 📚 Calculate total word count for book reviews
async function calculateTotalWordCount() {
    let totalWords = 0;
    // 1. Sum static book posts in the DOM
    let bookPosts = document.querySelectorAll(".post.books");
    for (let post of bookPosts) {
        let link = post.querySelector("a") ? post.querySelector("a").href : null;
        if (link) {
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
    }
    // 2. Sum dynamically added book posts from Firestore
    try {
        const snapshot = await db.collection('posts').where('section', '==', 'books').get();
        snapshot.forEach(doc => {
            const post = doc.data();
            if (post.totalWords) {
                const n = parseInt(post.totalWords);
                if (!isNaN(n)) totalWords += n;
            }
        });
    } catch (e) {
        console.error('Error fetching dynamic book posts for word count:', e);
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

        post.style.display = title.includes(input) ? "" : "none";
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
            post.style.display = selectedRating === "all" || rating >= parseFloat(selectedRating) ? "" : "none";
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
    // Also check the main-restaurant-list-section list items
    let mainListSection = document.getElementById("main-restaurant-list-section");
    if (mainListSection) {
        let listItems = mainListSection.querySelectorAll(".restaurant-list-item");
        listItems.forEach(item => {
            let cityElem = item.querySelector(".restaurant-meta, .restaurant-location");
            let cuisineElem = item.querySelector(".restaurant-cuisine");
            let cityText = cityElem ? cityElem.textContent.trim() : "";
            let cuisineText = cuisineElem ? cuisineElem.textContent.trim() : "";
            if (cityText) citySet.add(cityText);
            if (cuisineText) cuisineSet.add(cuisineText);
        });
    }
    let cityFilter = document.getElementById("cityFilter");
    let cuisineFilter = document.getElementById("cuisineFilter");
    // Clear existing options except 'all'
    cityFilter.innerHTML = '<option value="all">All Cities</option>';
    cuisineFilter.innerHTML = '<option value="all">All Cuisines</option>';
    // Add unique cities/cuisines
    Array.from(citySet).sort().forEach(city => {
        if (city && city !== 'undefined') cityFilter.innerHTML += `<option value="${city}">${city}</option>`;
    });
    Array.from(cuisineSet).sort().forEach(cuisine => {
        if (cuisine && cuisine !== 'undefined') cuisineFilter.innerHTML += `<option value="${cuisine}">${cuisine}</option>`;
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
        post.style.display = (matchCity && matchCuisine && matchRating) ? "" : "none";
    });

    // Also filter the main-restaurant-list-section list items
    let mainListSection = document.getElementById("main-restaurant-list-section");
    if (mainListSection) {
        let listItems = mainListSection.querySelectorAll(".restaurant-list-item");
        listItems.forEach(item => {
            let cityElem = item.querySelector(".restaurant-meta, .restaurant-location");
            let cuisineElem = item.querySelector(".restaurant-cuisine");
            let cityText = cityElem ? cityElem.textContent.trim().toLowerCase() : "";
            let cuisineText = cuisineElem ? cuisineElem.textContent.trim().toLowerCase() : "";
            let matchCity = (city === "all" || cityText === city.toLowerCase());
            let matchCuisine = (cuisine === "all" || cuisineText === cuisine.toLowerCase());
            item.style.display = (matchCity && matchCuisine) ? "" : "none";
        });
    }
}

// ===== Add Wishlist Item Logic =====
function attachCheckboxSync(checkbox) {
  checkbox.addEventListener('change', saveWishlistToCloud);
}

// 1. Firestore references for each category
const wishlistCategories = ['books', 'movies', 'games', 'restaurants', 'tvshows'];

function getWishlistCollection(category) {
  return db.collection('wishlists').doc(getSyncKey()).collection(category);
}

// Section order for books
const sectionOrder = {
  "GOT": 1,
  "The Lord of the Rings": 2,
  "Dune Books": 3,
  "Star Wars Books": 4,
  "Shogun Books": 5,
  "Murakami Books": 6,
  "Neuromancer Books": 7,
  "Altered Carbon Books": 8,
  "Cyberpunk": 9,
  "Russian History": 10,
  "Indian History": 11,
  "Self help": 12,
  "Economics/Psychology": 13,
  "F1": 14,
  "Others": 15
};

// 2. Render functions for each category
function renderWishlistCategory(category, items) {
  const ul = document.getElementById(`wishlist-${category}-list`);
  if (!ul) return;
  ul.innerHTML = '';

  if (category === 'books' || category === 'games') {
    // Group by section
    const sectionMap = {};
    items.forEach(item => {
      const section = item.section || 'Other';
      if (!sectionMap[section]) sectionMap[section] = [];
      sectionMap[section].push(item);
    });

    // Sort section keys for books by sectionOrder
    let sectionKeys = Object.keys(sectionMap);
    if (category === 'books') {
      sectionKeys = sectionKeys.sort((a, b) => (sectionOrder[a] || 999) - (sectionOrder[b] || 999));
    }

    sectionKeys.forEach(section => {
      // Sort items in section by 'order' field if present
      sectionMap[section].sort((a, b) => (a.order || 0) - (b.order || 0));
      // Section heading
      const sectionLi = document.createElement('li');
      sectionLi.className = 'wishlist-main-item';
      const sectionRow = document.createElement('div');
      sectionRow.className = 'wishlist-main-row';
      const sectionHeading = document.createElement('span');
      sectionHeading.className = 'wishlist-heading';
      sectionHeading.textContent = section;
      sectionRow.appendChild(sectionHeading);
      sectionLi.appendChild(sectionRow);

      // Section item list
      const sectionUl = document.createElement('ul');
      sectionMap[section].forEach(item => {
        const li = document.createElement('li');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'wishlist-checkbox wishlist-sub-checkbox';
        checkbox.checked = !!item.checked;
        checkbox.addEventListener('change', () => {
          getWishlistCollection(category).doc(item.id).update({ checked: checkbox.checked });
        });
        const wrapper = document.createElement('span');
        wrapper.className = 'wishlist-text-wrapper';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'wishlist-title';
        titleSpan.textContent = item.title;
        wrapper.appendChild(titleSpan);
        if (item.note) {
          const noteSpan = document.createElement('span');
          noteSpan.className = 'wishlist-note';
          noteSpan.textContent = item.note;
          wrapper.appendChild(noteSpan);
        }
        li.appendChild(checkbox);
        li.appendChild(wrapper);
        sectionUl.appendChild(li);
      });

      sectionLi.appendChild(sectionUl);
      ul.appendChild(sectionLi);
    });
  } else {
    // Default rendering for other categories
    items.forEach(item => {
      const li = document.createElement('li');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'wishlist-checkbox wishlist-sub-checkbox';
      checkbox.checked = !!item.checked;
      checkbox.addEventListener('change', () => {
        getWishlistCollection(category).doc(item.id).update({ checked: checkbox.checked });
      });
      const wrapper = document.createElement('span');
      wrapper.className = 'wishlist-text-wrapper';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'wishlist-title';
      titleSpan.textContent = item.title;
      wrapper.appendChild(titleSpan);
      if (item.note) {
        const noteSpan = document.createElement('span');
        noteSpan.className = 'wishlist-note';
        noteSpan.textContent = item.note;
        wrapper.appendChild(noteSpan);
      }
      li.appendChild(checkbox);
      li.appendChild(wrapper);
      ul.appendChild(li);
    });
  }
}

let wishlistUnsubs = [];

function attachAllWishlistListeners() {
  // Detach old listeners
  wishlistUnsubs.forEach(unsub => unsub && unsub());
  wishlistUnsubs = [];
  // Attach new listeners for the current user
  wishlistCategories.forEach(category => {
    const syncKey = getSyncKey(); // Get the sync key *before* attaching listener
    const unsub = db.collection('wishlists').doc(syncKey).collection(category).onSnapshot(snapshot => {
      const items = [];
      snapshot.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() });
      });
      renderWishlistCategory(category, items);
    }, error => { // Add error handling to the snapshot listener
        console.error(`Firestore snapshot listener error for ${category} (user ${syncKey}):`, error);
    });
    wishlistUnsubs.push(unsub);
  });
}

// 4. Add item functions for each category
function addWishlistItem(category, data) {
  return getWishlistCollection(category).add(data);
}

// 5. Hook up modals to Firestore
// --- Add Book ---
document.getElementById('submitAddBook').addEventListener('click', function() {
  const name = document.getElementById('bookNameInput').value.trim();
  const author = document.getElementById('bookAuthorInput').value.trim();
  let section = document.getElementById('bookGenreSelect').value;
  const otherSection = document.getElementById('bookOtherSectionInput')?.value.trim();
  if (section === 'new-section' && otherSection) section = otherSection;
  if (!name || !section) return;
  addWishlistItem('books', { title: name, note: author, section, checked: false });
  document.getElementById('bookNameInput').value = '';
  document.getElementById('bookAuthorInput').value = '';
  if (document.getElementById('bookOtherSectionInput')) document.getElementById('bookOtherSectionInput').value = '';
  document.getElementById('addBookModal').classList.remove('show');
});
// --- Add Movie ---
document.getElementById('submitAddMovie').addEventListener('click', function() {
  const name = document.getElementById('movieNameInput').value.trim();
  if (!name) return;
  addWishlistItem('movies', { title: name, checked: false });
  document.getElementById('movieNameInput').value = '';
  document.getElementById('addMovieModal').classList.remove('show');
});
// --- Add Game ---
document.getElementById('submitAddGame').addEventListener('click', function() {
  const name = document.getElementById('gameNameInput').value.trim();
  let section = document.getElementById('gameGenreSelect').value;
  const otherSection = document.getElementById('gameOtherSectionInput')?.value.trim();
  if (section === 'new-section' && otherSection) section = otherSection;
  if (!name || !section) return;
  addWishlistItem('games', { title: name, section, checked: false });
  document.getElementById('gameNameInput').value = '';
  if (document.getElementById('gameOtherSectionInput')) document.getElementById('gameOtherSectionInput').value = '';
  document.getElementById('addGameModal').classList.remove('show');
});
// --- Add Restaurant ---
document.getElementById('submitAddRestaurant').addEventListener('click', function() {
  const name = document.getElementById('restaurantNameInput').value.trim();
  let location = restaurantLocationSelect.value;
  if (location === 'new-location') {
    location = restaurantNewLocationInput.value.trim();
    if (location && !Array.from(restaurantLocationSelect.options).some(opt => opt.value === location)) {
      const newOption = document.createElement('option');
      newOption.value = location;
      newOption.textContent = location;
      restaurantLocationSelect.insertBefore(newOption, restaurantLocationSelect.querySelector('option[value="new-location"]'));
    }
  }
  let cuisine = restaurantCuisineSelect.value;
  if (cuisine === 'new-cuisine') {
    cuisine = restaurantNewCuisineInput.value.trim();
    if (cuisine && !Array.from(restaurantCuisineSelect.options).some(opt => opt.value === cuisine)) {
      const newOption = document.createElement('option');
      newOption.value = cuisine;
      newOption.textContent = cuisine;
      restaurantCuisineSelect.insertBefore(newOption, restaurantCuisineSelect.querySelector('option[value="new-cuisine"]'));
    }
  }
  if (!name || !location || !cuisine) return;
  addWishlistItem('restaurants', { title: name + (location ? (', ' + location) : ''), note: cuisine, checked: false });
  document.getElementById('restaurantNameInput').value = '';
  restaurantLocationSelect.value = '';
  restaurantNewLocationInput.value = '';
  restaurantNewLocationContainer.style.display = 'none';
  restaurantCuisineSelect.value = '';
  restaurantNewCuisineInput.value = '';
  restaurantNewCuisineContainer.style.display = 'none';
  document.getElementById('addRestaurantModal').classList.remove('show');
});
// --- Add TV Show ---
document.getElementById('submitAddTvShow').addEventListener('click', function() {
  const name = document.getElementById('tvShowNameInput').value.trim();
  const service = document.getElementById('tvShowServiceInput').value.trim();
  if (!name) return;
  addWishlistItem('tvshows', { title: name, note: service, checked: false });
  document.getElementById('tvShowNameInput').value = '';
  document.getElementById('tvShowServiceInput').value = '';
  document.getElementById('addTvShowModal').classList.remove('show');
});


auth.onAuthStateChanged(function(user) {
    currentUser = user;
    updateAuthBtn(user);
    initializePostsListener();

    // Detach old listeners before potentially attaching new ones
    wishlistUnsubs.forEach(unsub => unsub && unsub());
    wishlistUnsubs = [];

    // ===== MIGRATION LOGIC: Copy anonymous wishlist to Google UID on login =====
    // This should happen AFTER currentUser is set by the auth state change
    if (user && wishlistUserId && user.uid !== wishlistUserId) {
        const categories = ['books', 'movies', 'games', 'restaurants', 'tvshows'];
        categories.forEach(async (cat) => {
            const anonCol = db.collection('wishlists').doc(wishlistUserId).collection(cat);
            const userCol = db.collection('wishlists').doc(user.uid).collection(cat);
            try {
                // Attempt to read anonymous data
                const snapshot = await anonCol.get().catch(error => {
                    // Handle potential errors during the read, including permission denied
                    if (error.code === 'permission-denied') {
                         console.warn(`Permission denied to read anonymous ${cat} wishlist (user ${wishlistUserId}) for authenticated user ${user.uid}. Migration skipped for this category.`);
                    } else {
                         console.error(`Error reading anonymous ${cat} wishlist for migration:`, error);
                    }
                    return null; // Return null on error so the rest of the logic doesn't run
                });

                if (snapshot && !snapshot.empty) {
                    const batch = db.batch();
                    snapshot.forEach(doc => {
                        batch.set(userCol.doc(doc.id), doc.data());
                    });
                    await batch.commit();
                    // Optional: Delete anonymous data after successful migration
                    // const deleteBatch = db.batch();
                    // snapshot.forEach(doc => deleteBatch.delete(anonCol.doc(doc.id)));
                    // await deleteBatch.commit();
                    console.log(`Successfully migrated ${cat} wishlist for user ${user.uid}`);
                } else if (snapshot) {
                     console.log(`Anonymous ${cat} wishlist is empty or does not exist, no migration needed for user ${user.uid}`);
                } // If snapshot is null, error was already handled and logged in catch

            } catch (error) {
                // This outer catch is less likely to be hit now, but keep for safety
                console.error(`Unexpected error during ${cat} wishlist migration:`, error);
            }
        });
        // Optional: Remove the anonymous wishlistUserId from localStorage AFTER migration attempt
        // localStorage.removeItem('wishlistUserId');
    }

    // Re-attach dynamic listeners for the correct sync key AFTER state is determined
    attachAllWishlistListeners();
});

// === Main Restaurant Modal Logic ===

document.addEventListener('DOMContentLoaded', function () {
  // Modal elements
  const addBtn = document.getElementById('addMainRestaurantBtn');
  const modal = document.getElementById('addMainRestaurantModal');
  const closeModalBtn = document.getElementById('closeAddMainRestaurantModal');
  const locationSelect = document.getElementById('mainRestaurantLocationSelect');
  const newLocationContainer = document.getElementById('mainRestaurantNewLocationContainer');
  const newLocationInput = document.getElementById('mainRestaurantNewLocationInput');
  const cuisineSelect = document.getElementById('mainRestaurantCuisineSelect');
  const newCuisineContainer = document.getElementById('mainRestaurantNewCuisineContainer');
  const newCuisineInput = document.getElementById('mainRestaurantNewCuisineInput');
  const submitBtn = document.getElementById('submitAddMainRestaurant');

  // Show modal
  if (addBtn && modal) {
    addBtn.addEventListener('click', () => {
      populateMainRestaurantDropdowns(); // Always refresh before showing
      modal.classList.add('show');
    });
  }
  // Hide modal
  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }
  if (modal) {
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
  }
  // Show/hide new location input
  if (locationSelect && newLocationContainer) {
    locationSelect.addEventListener('change', function () {
      newLocationContainer.style.display = this.value === 'new-location' ? '' : 'none';
    });
  }
  // Show/hide new cuisine input
  if (cuisineSelect && newCuisineContainer) {
    cuisineSelect.addEventListener('change', function () {
      newCuisineContainer.style.display = this.value === 'new-cuisine' ? '' : 'none';
    });
  }
  // Submit logic
  if (submitBtn) {
    submitBtn.addEventListener('click', async function () {
      const name = document.getElementById('mainRestaurantNameInput').value.trim();
      let location = locationSelect.value;
      if (location === 'new-location') location = newLocationInput.value.trim();
      let cuisine = cuisineSelect.value;
      if (cuisine === 'new-cuisine') cuisine = newCuisineInput.value.trim();
      const rating = document.getElementById('mainRestaurantRatingInput').value.trim();
      const price = document.getElementById('mainRestaurantPriceSelect').value;
      const menuLink = document.getElementById('mainRestaurantMenuLinkInput').value.trim();
      if (!name || !location || !cuisine) return;
      const slug = slugify(name);
      // Add to Firestore
      await db.collection('main_restaurants').add({
        name, location, cuisine, rating, price, menuLink, slug, created: new Date()
      });
      // Add to DOM at the bottom
      appendMainRestaurantToList({ name, location, cuisine, rating, price, menuLink, slug });
      // Reset form
      document.getElementById('mainRestaurantNameInput').value = '';
      newLocationInput.value = '';
      newCuisineInput.value = '';
      document.getElementById('mainRestaurantRatingInput').value = '';
      document.getElementById('mainRestaurantPriceSelect').selectedIndex = 0;
      document.getElementById('mainRestaurantMenuLinkInput').value = '';
      modal.classList.remove('show');
      populateMainRestaurantDropdowns(); // Refresh dropdowns after add
    });
  }

  // Live update dropdowns if the DOM changes (e.g., new restaurant added)
  const mainListSection = document.getElementById('main-restaurant-list-section');
  if (mainListSection) {
    const observer = new MutationObserver(() => {
      populateMainRestaurantDropdowns();
    });
    observer.observe(mainListSection.querySelector('.restaurant-list'), { childList: true, subtree: true });
  }
});

// Populate dropdowns for location/cuisine from Firestore and current list
async function populateMainRestaurantDropdowns() {
  const locationSelect = document.getElementById('mainRestaurantLocationSelect');
  const cuisineSelect = document.getElementById('mainRestaurantCuisineSelect');
  if (!locationSelect || !cuisineSelect) return;
  // Gather from Firestore
  const snapshot = await db.collection('main_restaurants').get();
  const locations = new Set();
  const cuisines = new Set();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.location) locations.add(data.location);
    if (data.cuisine) cuisines.add(data.cuisine);
  });
  // Also gather from current DOM
  document.querySelectorAll('#main-restaurant-list-section .restaurant-meta').forEach(el => locations.add(el.textContent.trim()));
  document.querySelectorAll('#main-restaurant-list-section .restaurant-cuisine').forEach(el => cuisines.add(el.textContent.trim()));
  // Populate location dropdown
  locationSelect.innerHTML = '';
  Array.from(locations).sort().forEach(loc => {
    if (loc) locationSelect.innerHTML += `<option value="${loc}">${loc}</option>`;
  });
  locationSelect.innerHTML += '<option value="new-location">Add new location...</option>';
  // Populate cuisine dropdown
  cuisineSelect.innerHTML = '';
  Array.from(cuisines).sort().forEach(cui => {
    if (cui) cuisineSelect.innerHTML += `<option value="${cui}">${cui}</option>`;
  });
  cuisineSelect.innerHTML += '<option value="new-cuisine">Add new cuisine...</option>';
}

// Append new restaurant to the bottom of the list
function appendMainRestaurantToList({ name, location, cuisine, rating, price, menuLink, slug }) {
  const ul = document.querySelector('#main-restaurant-list-section .restaurant-list');
  if (!ul) return;
  const li = document.createElement('li');
  li.className = 'restaurant-list-item';
  // Name as link
  const link = document.createElement('a');
  link.className = 'restaurant-link';
  link.href = `restaurant.html?name=${encodeURIComponent(slug)}`;
  link.textContent = name;
  li.appendChild(link);
  // City
  const citySpan = document.createElement('span');
  citySpan.className = 'restaurant-meta';
  citySpan.textContent = location;
  li.appendChild(citySpan);
  // Cuisine
  const cuisineSpan = document.createElement('span');
  cuisineSpan.className = 'restaurant-cuisine';
  cuisineSpan.textContent = cuisine;
  li.appendChild(cuisineSpan);
  ul.appendChild(li);
}

// Function to append a new restaurant blog post
function appendRestaurantBlogPost({ name, location, cuisine, rating, price, menuLink }) {
  const blogPostsContainer = document.getElementById('blog-posts');
  if (!blogPostsContainer) return;
  const article = document.createElement('article');
  article.className = 'post restaurants';
  article.setAttribute('data-rating', rating || '');
  article.setAttribute('data-city', location || '');
  article.setAttribute('data-cuisine', cuisine || '');

  const h2 = document.createElement('h2');
  h2.textContent = name;
  article.appendChild(h2);

  const pLocation = document.createElement('p');
  pLocation.innerHTML = `<strong>Location:</strong> ${location}`;
  article.appendChild(pLocation);

  const pCuisine = document.createElement('p');
  pCuisine.innerHTML = `<strong>Cuisine:</strong> ${cuisine}`;
  article.appendChild(pCuisine);

  if (rating) {
    const pRating = document.createElement('p');
    pRating.innerHTML = `<strong>Rating:</strong> ⭐ ${rating}/10`;
    article.appendChild(pRating);
  }

  if (price) {
    const pPrice = document.createElement('p');
    pPrice.innerHTML = `<strong>Price:</strong> ${'💵'.repeat(Number(price))}`;
    article.appendChild(pPrice);
  }

  if (menuLink) {
    const pMenu = document.createElement('p');
    pMenu.innerHTML = `<a href="${menuLink}" target="_blank">View Menu</a>`;
    article.appendChild(pMenu);
  }

  blogPostsContainer.appendChild(article);
}

function slugify(text) {
  return text.toString().toLowerCase().replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')         // Trim - from start of text
    .replace(/-+$/, '');        // Trim - from end of text
}

// Helper function to create a blog post card
function createBlogPostCard(post) {
  // Minimal card: only image (with link) and plain text rating for all main sections
  let reviewPage = '';
  if (post.section === 'books') reviewPage = 'book_review.html';
  else if (post.section === 'movies') reviewPage = 'movie_review.html';
  else if (post.section === 'tvshows') reviewPage = 'tv_review.html';
  else if (post.section === 'games') reviewPage = 'game_review.html';

  // --- Fix: Handle Firestore Timestamp for created date ---
  let createdDate = post.created;
  if (createdDate && typeof createdDate.toDate === 'function') {
    createdDate = createdDate.toDate();
  }

  if (reviewPage) {
    const article = document.createElement('article');
    article.className = 'post ' + post.section;
    if (post.rating) article.setAttribute('data-rating', post.rating);
    article.setAttribute('data-uploaded', createdDate ? new Date(createdDate).toISOString().split('T')[0] : '');
    article.setAttribute('data-firestore', 'true'); // Mark as Firestore post

    // Image with link
    if (post.imageUrl) {
      const link = document.createElement('a');
      link.href = `${reviewPage}?id=${encodeURIComponent(post.id)}`;
      const img = document.createElement('img');
      img.src = post.imageUrl;
      img.alt = post.title || '';
      img.loading = 'lazy';
      link.appendChild(img);
      article.appendChild(link);
    }
    // Rating as 'Rating: ⭐ X/10'
    if (post.rating) {
      const p = document.createElement('p');
      p.textContent = `Rating: ⭐ ${post.rating}/10`;
      article.appendChild(p);
    }

    return article;
  }

  // Default card for other sections
  const article = document.createElement('article');
  article.className = 'post ' + post.section;
  if (post.rating) article.setAttribute('data-rating', post.rating);
  article.setAttribute('data-uploaded', createdDate ? new Date(createdDate).toISOString().split('T')[0] : '');
  article.setAttribute('data-firestore', 'true'); // Mark as Firestore post

  if (post.imageUrl) {
    const img = document.createElement('img');
    img.src = post.imageUrl;
    img.alt = post.section + ' image';
    img.loading = 'lazy';
    article.appendChild(img);
  }

  return article;
}

// Update renderBlogPostCard to use the new helper function
function renderBlogPostCard(post) {
  const blogPostsContainer = document.getElementById('blog-posts');
  if (!blogPostsContainer) return;

  const article = createBlogPostCard(post);
  if (!article) return;

  // Find the correct section to insert the post
  let targetSection = blogPostsContainer;
  if (post.section === 'books') {
    targetSection = document.querySelector('.books-section') || blogPostsContainer;
  } else if (post.section === 'movies') {
    targetSection = document.querySelector('.movies-section') || blogPostsContainer;
  } else if (post.section === 'tvshows') {
    targetSection = document.querySelector('.tvshows-section') || blogPostsContainer;
  } else if (post.section === 'games') {
    targetSection = document.querySelector('.games-section') || blogPostsContainer;
  }

  // Insert at the beginning of the section
  targetSection.insertBefore(article, targetSection.firstChild);
}

function makeField(label, value) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${label}:</strong> ${value}`;
  return p;
}

// Initialize Firestore listener
let postsUnsubscribe = null;
function initializePostsListener() {
    if (postsUnsubscribe) {
        postsUnsubscribe();
        postsUnsubscribe = null;
    }

    try {
        postsUnsubscribe = db.collection('posts')
            .orderBy('created', 'desc')
            .onSnapshot(snapshot => {
                const blogPostsContainer = document.getElementById('blog-posts');
                if (!blogPostsContainer) return;

                // Remove old dynamic posts
                const dynamicPosts = blogPostsContainer.querySelectorAll('.post[data-firestore="true"]');
                dynamicPosts.forEach(post => post.remove());

                // Add new dynamic posts
                snapshot.forEach(doc => {
                    const post = doc.data();
                    post.id = doc.id;
                    const article = createBlogPostCard(post);
                    if (article) {
                        // Find the first post of the same category
                        const category = post.section;
                        const firstPostOfCategory = blogPostsContainer.querySelector(`.post.${category}`);
                        
                        if (firstPostOfCategory) {
                            // Insert before the first post of this category
                            blogPostsContainer.insertBefore(article, firstPostOfCategory);
                        } else {
                            // If no posts of this category exist, add to the beginning
                            blogPostsContainer.insertBefore(article, blogPostsContainer.firstChild);
                        }
                    }
                });
            }, error => {
                console.error('Error loading posts:', error);
            });
    } catch (e) {
        console.error('Error setting up posts listener:', e);
    }
}

// Cleanup listener when page unloads
window.addEventListener('unload', () => {
    if (postsUnsubscribe) {
        postsUnsubscribe();
        postsUnsubscribe = null;
    }
});
