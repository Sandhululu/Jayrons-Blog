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
        authBtn.textContent = 'Logout';
        authBtn.style.display = 'none';
    } else {
        authBtn.textContent = 'Login with Google';
        authBtn.style.display = 'block';
    }
}

document.addEventListener("DOMContentLoaded", function () {
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

    // Wishlist mode
    if (category === "wishlist") {
        if (wishlistSection) wishlistSection.classList.add("show");
        if (blogPostsContainer) blogPostsContainer.style.display = "none";
        if (restaurantFilters) restaurantFilters.style.display = "none";
        if (ratingFilter) ratingFilter.style.display = "none";
        if (sortFilter) sortFilter.style.display = "none";
        if (filterSortContainer) filterSortContainer.style.display = "none";
        if (wordCountContainer) wordCountContainer.style.display = "none";
        return;
    } else {
        if (wishlistSection) wishlistSection.classList.remove("show");
        if (blogPostsContainer) blogPostsContainer.style.display = "";
        if (ratingFilter) ratingFilter.style.display = "inline-block";
        if (sortFilter) sortFilter.style.display = "inline-block";
        if (filterSortContainer) filterSortContainer.style.display = "block";
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
        populateRestaurantFilters();
        filterRestaurants();
    } else {
        restaurantFilters.style.display = "none";
        if (ratingFilter) ratingFilter.style.display = "inline-block";
        if (sortFilter) sortFilter.style.display = "inline-block";
    }

    posts.forEach(post => {
        let belongsToCategory = post.classList.contains(category) || category === "all";
        post.style.display = belongsToCategory ? "" : "none";
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
        post.style.display = (matchCity && matchCuisine && matchRating) ? "" : "none";
    });
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

    Object.keys(sectionMap).forEach(section => {
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
    const unsub = getWishlistCollection(category).onSnapshot(snapshot => {
      const items = [];
      snapshot.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() });
      });
      renderWishlistCategory(category, items);
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
  const location = document.getElementById('restaurantLocationInput').value.trim();
  const cuisine = document.getElementById('restaurantCuisineInput').value.trim();
  if (!name) return;
  addWishlistItem('restaurants', { title: name + (location ? (', ' + location) : ''), note: cuisine, checked: false });
  document.getElementById('restaurantNameInput').value = '';
  document.getElementById('restaurantLocationInput').value = '';
  document.getElementById('restaurantCuisineInput').value = '';
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

console.log("submitAddMovie loaded", document.getElementById("submitAddMovie"));

auth.onAuthStateChanged(function(user) {
    currentUser = user;
    updateAuthBtn(user);
    // ===== MIGRATION LOGIC: Copy anonymous wishlist to Google UID on login =====
    if (user && wishlistUserId && user.uid !== wishlistUserId) {
        const categories = ['books', 'movies', 'games', 'restaurants', 'tvshows'];
        categories.forEach(async (cat) => {
            const anonCol = db.collection('wishlists').doc(wishlistUserId).collection(cat);
            const userCol = db.collection('wishlists').doc(user.uid).collection(cat);
            const snapshot = await anonCol.get();
            snapshot.forEach(async (doc) => {
                await userCol.doc(doc.id).set(doc.data());
            });
            // Optionally: Delete the anonymous docs after migration
            // snapshot.forEach(async (doc) => await anonCol.doc(doc.id).delete());
        });
        // Optionally: Remove the anonymous wishlistUserId from localStorage
        // localStorage.removeItem('wishlistUserId');
    }
    // Re-attach dynamic listeners for the correct sync key
    attachAllWishlistListeners();
});
