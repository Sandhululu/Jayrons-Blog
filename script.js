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
// Initialize Firebase app only once
if (!window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

// Enable offline persistence - do this AFTER initializing the app
window.firebase.firestore().enablePersistence()
  .catch((err) => {
      if (err.code === 'failed-precondition') {
          console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
      } else if (err.code === 'unimplemented') {
          console.warn('The current browser does not support persistence.');
      }
  });

const db = window.firebase.firestore();

// Auth instance
const auth = window.firebase.auth();
let currentUser = null;

let wishlistUserId = localStorage.getItem('wishlistUserId');
if (!wishlistUserId) {
  wishlistUserId = crypto.randomUUID();
  localStorage.setItem('wishlistUserId', wishlistUserId);
}
console.log(`DEBUG: Initial script load - wishlistUserId: ${wishlistUserId}`);

// Helper to get the correct sync key (user.uid if logged in, else wishlistUserId)
function getSyncKey() {
  const key = currentUser && currentUser.uid ? currentUser.uid : wishlistUserId;
  console.log(`DEBUG: getSyncKey returning: ${key} (currentUser: ${currentUser ? currentUser.uid : 'null'}, wishlistUserId: ${wishlistUserId})`);
  return key;
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

// Add cache for posts and restaurants with pagination
let postsCache = null;
let restaurantsCache = null;
const POSTS_PER_PAGE = 10;
let lastVisiblePost = null;
let hasMorePosts = true;

// Initialize Firestore listener with pagination
let postsUnsubscribe = null;
let isInitialLoad = true; // Add flag to track initial load again

// Initialize word count cache
const wordCountCache = new Map();

// Add debounce function at the top of the file
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
      const later = () => {
          clearTimeout(timeout);
          func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
  };
}

// Create debounced version of wishlist update
const debouncedUpdateWishlist = debounce((snapshot, category) => {
  console.log(`DEBUG: debouncedUpdateWishlist called for ${category} with ${snapshot.size} items`);
  
  // Create a new array to store the items
  const items = [];
  
  // Process each document in the snapshot
  snapshot.forEach(doc => {
    const data = doc.data();
    // Ensure we have all required fields and include the new 'order' field
    const item = {
      id: doc.id,
      title: data.title || '',
      checked: !!data.checked,
      section: data.section || 'Other',
      note: data.note || '',
      order: data.order || null // Add the new 'order' field
    };
    console.log(`DEBUG: Processed item for ${category}:`, item);
    items.push(item);
  });
  
  console.log(`DEBUG: Total processed items for ${category}:`, items.length);
  console.log(`DEBUG: First few items for ${category}:`, items.slice(0, 3));
  
  // Call renderWishlistCategory with the processed items
  renderWishlistCategory(category, items);
}, 100); // Reduced debounce time for better responsiveness

// Create debounced versions of the update functions
const debouncedUpdatePosts = debounce((snapshot, blogPostsContainer) => {
  console.log('onSnapshot received snapshot. Doc changes:', snapshot.docChanges().length);
  if (!blogPostsContainer) return;

  // Update cache (optional, but good practice if cache is used elsewhere)
  postsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Process each change individually
  snapshot.docChanges().forEach(change => {
      const post = change.doc.data();
      post.id = change.doc.id;
      const existingPostElement = blogPostsContainer.querySelector(`[data-firestore="true"][data-id="${post.id}"]`);
      console.log(`Processing change: ${change.type} for post ${post.id}`);

      if (change.type === 'added') {
          if (!existingPostElement) {
              const article = createBlogPostCard(post);
              if (article) {
                  blogPostsContainer.insertBefore(article, blogPostsContainer.firstChild);
                  console.log('Prepended added post:', post.id);
              }
          }
      } else if (change.type === 'modified') {
          if (existingPostElement) {
              const newArticle = createBlogPostCard(post);
              if (newArticle) {
                  blogPostsContainer.replaceChild(newArticle, existingPostElement);
                  console.log('Replaced modified post:', post.id);
              }
          }
      } else if (change.type === 'removed') {
          if (existingPostElement) {
              existingPostElement.remove();
              console.log('Removed post:', post.id);
          }
      }
  });

  // Hide loading state and show posts after initial content is loaded
  if (isInitialLoad) {
      console.log('Initial load complete, hiding loading state.');
      isInitialLoad = false;
      const loadingElement = document.getElementById('posts-loading');
      if (loadingElement) {
          loadingElement.classList.add('hidden');
      }
      sortAllPostsByDate();
  } else {
      sortAllPostsByDate();
  }
}, 0);

// Function to sort all posts by upload date
function sortAllPostsByDate() {
  const blogPostsContainer = document.getElementById('blog-posts');
  if (!blogPostsContainer) return;

  // Get all posts (both static and dynamic)
  const posts = Array.from(blogPostsContainer.children);
  
  // Sort posts by upload date (newest first)
  posts.sort((a, b) => {
      const dateA = a.getAttribute('data-uploaded');
      const dateB = b.getAttribute('data-uploaded');
      
      // Convert to Date objects for proper comparison
      const dateObjA = new Date(dateA);
      const dateObjB = new Date(dateB);
      
      // Sort newest first
      return dateObjB - dateObjA;
  });

  // Reorder the posts in the DOM
  posts.forEach(post => {
      blogPostsContainer.appendChild(post);
  });
}

function initializePostsListener() {
  console.log('initializePostsListener called');
  if (postsUnsubscribe) {
      console.log('Listener already initialized, returning.');
      return;
  }

  // Show loading state immediately
  const blogPostsContainer = document.getElementById('blog-posts');
  const loadingElement = document.getElementById('posts-loading');
  if (blogPostsContainer && loadingElement) {
      loadingElement.classList.remove('hidden');
  }

  try {
      // Query all posts, ordered by created desc (no pagination)
      const initialQuery = db.collection('posts')
          .orderBy('created', 'desc');

      let lastSnapshot = null;
      postsUnsubscribe = initialQuery.onSnapshot(snapshot => {
          // Only update if there are actual changes
          if (lastSnapshot && JSON.stringify(snapshot.docs.map(doc => doc.data())) === 
              JSON.stringify(lastSnapshot.docs.map(doc => doc.data()))) {
              return;
          }
          lastSnapshot = snapshot;
          debouncedUpdatePosts(snapshot, blogPostsContainer);
      }, error => {
          console.error('Error loading posts:', error);
          if (loadingElement) {
              loadingElement.classList.add('hidden');
          }
      });
  } catch (e) {
      console.error('Error setting up posts listener:', e);
      if (loadingElement) {
          loadingElement.classList.add('hidden');
      }
  }
}

// REMOVE: loadMorePosts, updateLoadMoreButton, and all pagination logic

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

  // Categories where Add Post button should be visible
  const showAddPostCategories = ["all", "food", "movies", "tv", "books", "games"];

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
      if (addPostBtn) addPostBtn.style.display = "none";
      return;
  } else {
      if (wishlistSection) wishlistSection.classList.remove("show");
      if (blogPostsContainer) blogPostsContainer.style.display = "";
      if (ratingFilter) ratingFilter.style.display = "inline-block";
      if (sortFilter) sortFilter.style.display = "inline-block";
      if (filterSortContainer) filterSortContainer.style.display = "block";
      // Only show Add Post button for allowed categories
      if (addPostBtn) addPostBtn.style.display = showAddPostCategories.includes(category) ? "block" : "none";
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
      if (addPostBtn) addPostBtn.style.display = "none";
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
  
  // 1. Sum static book posts in the DOM with caching
  let bookPosts = document.querySelectorAll(".post.books");
  for (let post of bookPosts) {
      let link = post.querySelector("a")?.href;
      if (!link) continue;

      // Check cache first
      if (wordCountCache.has(link)) {
          totalWords += wordCountCache.get(link);
          continue;
      }

      try {
          const response = await fetch(link);
          const text = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, "text/html");
          const paragraphs = doc.querySelectorAll("p");
          for (let p of paragraphs) {
              if (p.textContent.includes("📚 Total Words:")) {
                  const wordCount = parseInt(p.textContent.replace(/[^0-9]/g, '')) || 0;
                  wordCountCache.set(link, wordCount);
                  totalWords += wordCount;
                  break;
              }
          }
      } catch (error) {
          console.error("Error fetching word count for:", link, error);
      }
  }

  // 2. Sum dynamic book posts from cache
  if (postsCache) {
      postsCache.forEach(post => {
          if (post.section === 'books' && post.totalWords) {
              const n = parseInt(post.totalWords);
              if (!isNaN(n)) totalWords += n;
          }
      });
  }

  // Update display
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

// Book series order within sections
const bookSeriesOrder = {
  "GOT": {
    "A Game of Thrones": 1,
    "A Clash of Kings": 2,
    "A Storm of Swords": 3,
    "A Feast for Crows": 4,
    "A Dance with Dragons": 5,
    "The Winds of Winter": 6,
    "A Dream of Spring": 7
  },
  "The Lord of the Rings": {
    "The Fellowship of the Ring": 1,
    "The Two Towers": 2,
    "The Return of the King": 3,
    "The Hobbit": 4,
    "The Silmarillion": 5
  },
  "Dune Books": {
    "Dune": 1,
    "Dune Messiah": 2,
    "Children of Dune": 3,
    "God Emperor of Dune": 4,
    "Heretics of Dune": 5,
    "Chapterhouse: Dune": 6
  },
  "Star Wars Books": {
    "Heir to the Empire": 1,
    "Dark Force Rising": 2,
    "The Last Command": 3
  },
  "Shogun Books": {
    "Shogun": 1,
    "Tai-Pan": 2,
    "Gai-Jin": 3,
    "King Rat": 4,
    "Noble House": 5,
    "Whirlwind": 6
  },
  "Murakami Books": {
    "Norwegian Wood": 1,
    "Kafka on the Shore": 2,
    "1Q84": 3,
    "The Wind-Up Bird Chronicle": 4,
    "Hard-Boiled Wonderland and the End of the World": 5,
    "A Wild Sheep Chase": 6,
    "Dance Dance Dance": 7,
    "South of the Border, West of the Sun": 8,
    "Sputnik Sweetheart": 9,
    "After Dark": 10,
    "Colorless Tsukuru Tazaki and His Years of Pilgrimage": 11,
    "The Elephant Vanishes": 12,
    "Men Without Women": 13,
    "First Person Singular": 14
  },
  "Neuromancer Books": {
    "Neuromancer": 1,
    "Count Zero": 2,
    "Mona Lisa Overdrive": 3
  },
  "Altered Carbon Books": {
    "Altered Carbon": 1,
    "Broken Angels": 2,
    "Woken Furies": 3
  }
};

// 2. Render functions for each category
function renderWishlistCategory(category, items) {
  console.log(`DEBUG: renderWishlistCategory called for ${category} with ${items.length} items`);
  const ul = document.getElementById(`wishlist-${category}-list`);
  if (!ul) {
    console.error(`ERROR: Could not find wishlist-${category}-list element`);
    return;
  }
  
  console.log(`DEBUG: Found wishlist-${category}-list element, clearing and rendering items`);
  ul.innerHTML = '';
  
  if (category === 'books' || category === 'games') {
    // Group by section
    const sectionMap = {};
    items.forEach(item => {
      const section = item.section || 'Other';
      if (!sectionMap[section]) sectionMap[section] = [];
      sectionMap[section].push(item);
    });

    // Sort section keys alphabetically for books and games
    let sectionKeys = Object.keys(sectionMap).sort();

    console.log(`DEBUG: Rendering ${sectionKeys.length} sections for ${category}`);
    console.log(`DEBUG: Section keys (alphabetical):`, sectionKeys);
    
    // Define sections that should always be sorted alphabetically by title
    const alwaysAlphabeticalSections = ['F1', 'Cyberpunk', 'Economics/Psychology', 'Indian History', 'Others', 'Russian History', 'Self help'];

    sectionKeys.forEach(section => {
      console.log(`DEBUG: Processing section ${section} with ${sectionMap[section].length} items`);
      
      // Sort items within each section for books/games, prioritizing 'order' field or alphabetical
      sectionMap[section].sort((a, b) => {
        // If the current section is in the alwaysAlphabeticalSections list, force alphabetical sort
        if (alwaysAlphabeticalSections.includes(section)) {
          console.log(`DEBUG: Forcing alphabetical sort for section: ${section}`);
          return a.title.localeCompare(b.title);
        }

        // Otherwise, use explicit order (Book No. or predefined series order), then alphabetical fallback
        const orderA = a.order !== null ? a.order : (bookSeriesOrder[section] ? bookSeriesOrder[section][a.title] : 999);
        const orderB = b.order !== null ? b.order : (bookSeriesOrder[section] ? bookSeriesOrder[section][b.title] : 999);
        
        // If explicit orders are the same or not defined, sort alphabetically by title
        if (orderA === orderB) {
          return a.title.localeCompare(b.title);
        }
        
        return orderA - orderB;
      });

      // Create section container
      const sectionLi = document.createElement('li');
      sectionLi.className = 'wishlist-main-item';
      
      // Create section header
      const sectionRow = document.createElement('div');
      sectionRow.className = 'wishlist-main-row';
      const sectionHeading = document.createElement('span');
      sectionHeading.className = 'wishlist-heading';
      sectionHeading.textContent = section;
      sectionRow.appendChild(sectionHeading);
      sectionLi.appendChild(sectionRow);

      // Create section items list
      const sectionUl = document.createElement('ul');
      sectionMap[section].forEach(item => {
        console.log(`DEBUG: Rendering item in ${section}:`, item);
        const li = document.createElement('li');
        
        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'wishlist-checkbox wishlist-sub-checkbox';
        checkbox.checked = !!item.checked;
        checkbox.addEventListener('change', () => {
          getWishlistCollection(category).doc(item.id).update({ checked: checkbox.checked });
        });
        
        // Create text wrapper
        const wrapper = document.createElement('span');
        wrapper.className = 'wishlist-text-wrapper';
        
        // Create title
        const titleSpan = document.createElement('span');
        titleSpan.className = 'wishlist-title';
        titleSpan.textContent = item.title;
        wrapper.appendChild(titleSpan);
        
        // Add note if exists
        if (item.note) {
          const noteSpan = document.createElement('span');
          noteSpan.className = 'wishlist-note';
          noteSpan.textContent = item.note;
          wrapper.appendChild(noteSpan);
        }
        
        // Assemble the item
        li.appendChild(checkbox);
        li.appendChild(wrapper);
        sectionUl.appendChild(li);
      });

      sectionLi.appendChild(sectionUl);
      ul.appendChild(sectionLi);
    });
  } else if (category === 'movies') {
    // Sort movies alphabetically by title
    items.sort((a, b) => a.title.localeCompare(b.title));
    console.log(`DEBUG: Rendering ${items.length} movies (alphabetical by title)`);
    items.forEach(item => {
      console.log(`DEBUG: Rendering movie:`, item);
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
  } else if (category === 'tvshows') {
    // Group by note (streaming service)
    const serviceMap = {};
    items.forEach(item => {
      const service = item.note || 'Other'; // Use note as service
      if (!serviceMap[service]) serviceMap[service] = [];
      serviceMap[service].push(item);
    });

    // Sort service keys alphabetically
    let serviceKeys = Object.keys(serviceMap).sort();

    console.log(`DEBUG: Rendering ${serviceKeys.length} TV show services`);
    console.log(`DEBUG: Service keys (alphabetical):`, serviceKeys);

    serviceKeys.forEach(service => {
      console.log(`DEBUG: Processing service ${service} with ${serviceMap[service].length} items`);
      
      // Sort items within each service group alphabetically by title
      serviceMap[service].sort((a, b) => a.title.localeCompare(b.title));

      // Create service container (like a section)
      const serviceLi = document.createElement('li');
      serviceLi.className = 'wishlist-main-item';
      
      // Create service header
      const serviceRow = document.createElement('div');
      serviceRow.className = 'wishlist-main-row';
      const serviceHeading = document.createElement('span');
      serviceHeading.className = 'wishlist-heading';
      serviceHeading.textContent = service; // Display service name as heading
      serviceRow.appendChild(serviceHeading);
      serviceLi.appendChild(serviceRow);

      // Create service items list
      const serviceUl = document.createElement('ul');
      serviceMap[service].forEach(item => {
        console.log(`DEBUG: Rendering TV show item in ${service}:`, item);
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
        
        // Do not display note again here as it's the heading
        
        li.appendChild(checkbox);
        li.appendChild(wrapper);
        serviceUl.appendChild(li);
      });

      serviceLi.appendChild(serviceUl);
      ul.appendChild(serviceLi);
    });
  } else {
    // Default rendering for other categories (restaurants, etc.)
    console.log(`DEBUG: Rendering ${items.length} items for ${category} using default rendering`);
    items.forEach(item => {
      console.log(`DEBUG: Rendering item in ${category}:`, item);
      const li = document.createElement('li');
      
      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'wishlist-checkbox wishlist-sub-checkbox';
      checkbox.checked = !!item.checked;
      checkbox.addEventListener('change', () => {
        getWishlistCollection(category).doc(item.id).update({ checked: checkbox.checked });
      });
      
      // Create text wrapper
      const wrapper = document.createElement('span');
      wrapper.className = 'wishlist-text-wrapper';
      
      // Create title
      const titleSpan = document.createElement('span');
      titleSpan.className = 'wishlist-title';
      titleSpan.textContent = item.title;
      wrapper.appendChild(titleSpan);
      
      // Add note if exists
      if (item.note) {
        const noteSpan = document.createElement('span');
        noteSpan.className = 'wishlist-note';
        noteSpan.textContent = item.note;
        wrapper.appendChild(noteSpan);
      }
      
      // Assemble the item
      li.appendChild(checkbox);
      li.appendChild(wrapper);
      ul.appendChild(li);
    });
  }
  console.log(`DEBUG: Finished rendering ${category} wishlist`);
}

let wishlistUnsubs = [];

// Function to attach wishlist listeners with error handling
function attachAllWishlistListeners() {
  console.log('DEBUG: attachAllWishlistListeners - Executing, version 2024-06-10.');
  // Detach old listeners
  wishlistUnsubs.forEach(unsub => unsub && unsub());
  wishlistUnsubs = [];
  
  // Attach new listeners for the current user
  wishlistCategories.forEach(category => {
    const syncKey = getSyncKey();
    console.log(`DEBUG: Attaching listener for ${category} wishlist with syncKey: ${syncKey}`);

    if (!syncKey) {
      console.error(`ERROR: Skipping listener for ${category} wishlist due to empty syncKey.`);
      return;
    }

    const collectionPath = `wishlists/${syncKey}/${category}`;
    console.log(`DEBUG: Setting up listener for collection path: ${collectionPath}`);

    // First, get the initial data
    db.collection('wishlists').doc(syncKey).collection(category)
      .get()
      .then(snapshot => {
        console.log(`DEBUG: Initial data load for ${category} with ${snapshot.size} items`);
        // Force immediate update for initial load
        const items = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          items.push({
            id: doc.id,
            title: data.title || '',
            checked: !!data.checked,
            section: data.section || 'Other',
            note: data.note || '',
            order: data.order || null // Add the new 'order' field
          });
        });
        console.log(`DEBUG: Processing initial ${items.length} items for ${category}`);
        renderWishlistCategory(category, items);
      })
      .catch(error => {
        console.error(`ERROR: Error loading initial data for ${category}:`, error);
      });

    // Then set up the listener for changes
    const unsub = db.collection('wishlists').doc(syncKey).collection(category)
      .onSnapshot(
        snapshot => {
          console.log(`DEBUG: Received snapshot for ${category} with ${snapshot.size} items`);
          console.log(`DEBUG: Snapshot metadata:`, snapshot.metadata);
          console.log(`DEBUG: Snapshot empty:`, snapshot.empty);
          
          // Only update if there are actual changes and no pending writes
          if (!snapshot.metadata.hasPendingWrites) {
            console.log(`DEBUG: Calling debouncedUpdateWishlist for ${category}`);
            debouncedUpdateWishlist(snapshot, category);
          } else {
            console.log(`DEBUG: Skipping update for ${category} due to pending writes`);
          }
        },
        error => {
          console.error(`ERROR: Error in ${category} wishlist listener:`, error);
        }
      );
    wishlistUnsubs.push(unsub);
  });
}

// 4. Add item functions for each category
function addWishlistItem(category, data) {
return getWishlistCollection(category).add(data);
}

// 5. Hook up modals to Firestore
// --- Add Book ---
document.getElementById('submitAddBook').addEventListener('click', async function() {
  const name = document.getElementById('bookNameInput').value.trim();
  const author = document.getElementById('bookAuthorInput').value.trim();
  let section = document.getElementById('bookGenreSelect').value;
  const otherSection = document.getElementById('bookOtherSectionInput')?.value.trim();
  const bookNumber = parseInt(document.getElementById('bookNumberInput')?.value.trim()); // Get book number

  if (section === 'new-section' && otherSection) section = otherSection;
  if (!name || !section) {
    console.warn('WARNING: Missing book name or section. Not adding book.');
    alert('Please provide a book name and a section/series.');
    return; // Prevent submission if critical fields are missing
  }

  const bookData = { title: name, note: author, section, checked: false };
  if (!isNaN(bookNumber)) {
    bookData.order = bookNumber; // Add order to book data if valid
  }

  try {
    await addWishlistItem('books', bookData);
    console.log(`DEBUG: Successfully added single book: '${name}' to section '${section}'`);
    alert('Book added successfully!');
  } catch (e) {
    console.error(`ERROR: Failed to add single book '${name}':`, e);
    alert('Error adding book: ' + e.message);
  }

  // Clear common fields after submission
  document.getElementById('bookNameInput').value = '';
  document.getElementById('bookAuthorInput').value = '';
  if (document.getElementById('bookOtherSectionInput')) document.getElementById('bookOtherSectionInput').value = '';
  if (document.getElementById('bookNumberInput')) document.getElementById('bookNumberInput').value = '';
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
  console.log('DEBUG: Auth state changed, user:', user ? user.uid : 'null', '; current wishlistUserId:', wishlistUserId);
  currentUser = user;
  updateAuthBtn(user);
  
  // Re-attach wishlist listeners with the new user ID
  // Now this is the SOLE place attachAllWishlistListeners is called.
  if (!window.wishlistListenersInitialized) {
      window.wishlistListenersInitialized = true; // Ensure this flag is set only once
  }
  console.log('DEBUG: Calling attachAllWishlistListeners from onAuthStateChanged.');
  attachAllWishlistListeners();
  
  // ===== MIGRATION LOGIC: Copy anonymous wishlist to Google UID on login =====
  let currentWishlistUserIdForMigration = localStorage.getItem('wishlistUserId');
  console.log('DEBUG: onAuthStateChanged - currentWishlistUserId for migration:', currentWishlistUserIdForMigration);

  if (user && currentWishlistUserIdForMigration && user.uid !== currentWishlistUserIdForMigration) {
      const categories = ['books', 'movies', 'games', 'restaurants', 'tvshows'];
      let migrationNeeded = false;

      Promise.all(categories.map(async (cat) => {
          const anonCol = db.collection('wishlists').doc(currentWishlistUserIdForMigration).collection(cat);
          try {
              const snapshot = await anonCol.get();
              if (snapshot && !snapshot.empty) {
                  migrationNeeded = true;
              }
          } catch (error) {
              if (error.code === 'permission-denied') {
                  console.warn(`Permission denied to read anonymous ${cat} wishlist. Skipping migration for this category.`);
              } else {
                  console.error(`Error checking anonymous ${cat} wishlist for migration:`, error);
              }
          }
      })).then(() => {
          if (migrationNeeded) {
              categories.forEach(async (cat) => {
                  const anonCol = db.collection('wishlists').doc(currentWishlistUserIdForMigration).collection(cat);
                  const userCol = db.collection('wishlists').doc(user.uid).collection(cat);
                  try {
                      const snapshot = await anonCol.get();
                      if (snapshot && !snapshot.empty) {
                          const batch = db.batch();
                          snapshot.forEach(doc => {
                              batch.set(userCol.doc(doc.id), doc.data());
                          });
                          await batch.commit();
                          console.log(`Successfully migrated ${cat} wishlist for user ${user.uid}`);
                          // After migration, clear the anonymous wishlist
                          snapshot.forEach(doc => {
                              batch.delete(anonCol.doc(doc.id));
                          });
                          console.log(`Cleared anonymous ${cat} wishlist after migration.`);
                      }
                  } catch (error) {
                      console.error(`Error during ${cat} wishlist migration:`, error);
                  }
              });
              // Clear localStorage item for anonymous ID after successful migration of all categories
              localStorage.removeItem('wishlistUserId');
              wishlistUserId = null; // Ensure in-memory is also null
              console.log('DEBUG: Cleared wishlistUserId from localStorage and memory after migration.');
          } else {
              console.log('No wishlist migration needed - no existing wishlist items found');
          }
      });
  } else if (user && !currentWishlistUserIdForMigration) {
      console.log('DEBUG: onAuthStateChanged - User logged in, no anonymous wishlist ID found. No migration needed.');
  } else if (!user && currentWishlistUserIdForMigration) {
      wishlistUserId = currentWishlistUserIdForMigration; // Ensure global wishlistUserId is from localStorage for anonymous users
      console.log('DEBUG: onAuthStateChanged - Anonymous user, ensuring global wishlistUserId is from localStorage.');
  } else if (!user && !currentWishlistUserIdForMigration) {
      console.log('DEBUG: onAuthStateChanged - Neither logged in nor anonymous ID found. Initial script load should handle this.');
  }
});

// Helper function to create a blog post card
function createBlogPostCard(post) {
  // Minimal card: only image (with link) and plain text rating for all main sections
  let reviewPage = '';
  if (post.section === 'books') reviewPage = 'book_review.html';
  else if (post.section === 'movies') reviewPage = 'movie_review.html';
  else if (post.section === 'tvshows') reviewPage = 'tv_review.html';
  else if (post.section === 'games') reviewPage = 'game_review.html';
  else if (post.section === 'food') reviewPage = 'reviews/food_review.html';

  // --- Fix: Handle Firestore Timestamp for created date ---
  let createdDate = post.created;
  if (createdDate && typeof createdDate.toDate === 'function') {
      createdDate = createdDate.toDate();
  }

  if (reviewPage) {
      const article = document.createElement('article');
      // Use 'tv' class for TV shows to match existing HTML
      article.className = 'post ' + (post.section === 'tvshows' ? 'tv' : post.section);
      if (post.rating) article.setAttribute('data-rating', post.rating);
      article.setAttribute('data-uploaded', createdDate ? createdDate.toISOString() : new Date().toISOString());
      article.setAttribute('data-firestore', 'true');
      article.setAttribute('data-id', post.id);

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

      // Add clickable title only for food posts
      if (post.section === 'food' && post.title) {
          const titleLink = document.createElement('a');
          titleLink.href = `${reviewPage}?id=${encodeURIComponent(post.id)}`;
          titleLink.style.color = 'white';
          titleLink.style.textDecoration = 'none';
          titleLink.style.visited = 'white';
          const h2 = document.createElement('h2');
          h2.textContent = post.title;
          titleLink.appendChild(h2);
          article.appendChild(titleLink);
      }

      // Rating as plain text for all sections
      if (post.rating) {
          const p = document.createElement('p');
          p.textContent = `Rating: ⭐ ${post.rating}/10`;
          article.appendChild(p);
      }

      return article;
  }

  // Default card for other sections
  const article = document.createElement('article');
  // Use 'tv' class for TV shows to match existing HTML
  article.className = 'post ' + (post.section === 'tvshows' ? 'tv' : post.section);
  if (post.rating) article.setAttribute('data-rating', post.rating);
  article.setAttribute('data-uploaded', createdDate ? createdDate.toISOString() : new Date().toISOString());
  article.setAttribute('data-firestore', 'true');
  article.setAttribute('data-id', post.id);

  if (post.imageUrl) {
      const img = document.createElement('img');
      img.src = post.imageUrl;
      img.alt = post.section + ' image';
      img.loading = 'lazy';
      article.appendChild(img);
  }

  return article;
}

function makeField(label, value) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${label}:</strong> ${value}`;
  return p;
}

// Cleanup listener when page unloads
window.addEventListener('unload', () => {
  if (postsUnsubscribe) {
      postsUnsubscribe();
      postsUnsubscribe = null;
  }
});

// Populate dropdowns for location/cuisine from Firestore and current list
async function populateMainRestaurantDropdowns() {
const locationSelect = document.getElementById('mainRestaurantLocationSelect');
const cuisineSelect = document.getElementById('mainRestaurantCuisineSelect');
if (!locationSelect || !cuisineSelect) return;

// Use cache if available, otherwise fetch from Firestore
if (!restaurantsCache) {
  const snapshot = await db.collection('main_restaurants')
      .orderBy('name')
      .get();
  restaurantsCache = snapshot.docs.map(doc => doc.data());
}

const locations = new Set();
const cuisines = new Set();

// Add from cache
restaurantsCache.forEach(data => {
  if (data.location) locations.add(data.location);
  if (data.cuisine) cuisines.add(data.cuisine);
});

// Also gather from current DOM
document.querySelectorAll('#main-restaurant-list-section .restaurant-meta').forEach(el => 
    locations.add(el.textContent.trim()));
document.querySelectorAll('#main-restaurant-list-section .restaurant-cuisine').forEach(el => 
    cuisines.add(el.textContent.trim()));

// Populate dropdowns
updateDropdown(locationSelect, locations, 'new-location');
updateDropdown(cuisineSelect, cuisines, 'new-cuisine');
}

// Helper function to update dropdowns
function updateDropdown(select, values, newOptionValue) {
  select.innerHTML = '';
  Array.from(values).sort().forEach(value => {
      if (value) select.innerHTML += `<option value="${value}">${value}</option>`;
  });
  select.innerHTML += `<option value="${newOptionValue}">Add new ${newOptionValue.replace('new-', '')}...</option>`;
}

// Batch operations for restaurant updates
async function appendMainRestaurantToList({ name, location, cuisine, rating, price, menuLink, slug }) {
  const ul = document.querySelector('#main-restaurant-list-section .restaurant-list');
  if (!ul) return;

  // Add to cache
  if (!restaurantsCache) restaurantsCache = [];
  restaurantsCache.push({ name, location, cuisine, rating, price, menuLink, slug });

  // Create DOM element
  const li = createRestaurantListItem({ name, location, cuisine, slug });
  ul.appendChild(li);

  // Update dropdowns
  populateMainRestaurantDropdowns();
}

// Helper function to create restaurant list item
function createRestaurantListItem({ name, location, cuisine, slug }) {
  const li = document.createElement('li');
  li.className = 'restaurant-list-item';
  
  const link = document.createElement('a');
  link.className = 'restaurant-link';
  link.href = `restaurant.html?name=${encodeURIComponent(slug)}`;
  link.textContent = name;
  li.appendChild(link);

  const citySpan = document.createElement('span');
  citySpan.className = 'restaurant-meta';
  citySpan.textContent = location;
  li.appendChild(citySpan);

  const cuisineSpan = document.createElement('span');
  cuisineSpan.className = 'restaurant-cuisine';
  cuisineSpan.textContent = cuisine;
  li.appendChild(cuisineSpan);

  return li;
}

function slugify(text) {
return text.toString().toLowerCase().replace(/\s+/g, '-') // Replace spaces with -
  .replace(/[^\w\-]+/g, '') // Remove all non-word chars
  .replace(/\-\-+/g, '-')   // Replace multiple - with single -
  .replace(/^-+/, '')         // Trim - from start of text
  .replace(/-+$/, '');        // Trim - from end of text
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
      // Look for both tv and tvshows sections
      targetSection = document.querySelector('.tvshows-section, .tv-section') || blogPostsContainer;
  } else if (post.section === 'games') {
      targetSection = document.querySelector('.games-section') || blogPostsContainer;
  }

  // Insert at the beginning of the section
  targetSection.insertBefore(article, targetSection.firstChild);
}

// Only alphabetize the Add Book modal genre/section dropdown
function alphabetizeSelectOptions(selectId, exceptLastValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  let options = Array.from(select.options);
  let lastOption = null;
  if (exceptLastValue) {
    lastOption = options.find(opt => opt.value === exceptLastValue);
    options = options.filter(opt => opt.value !== exceptLastValue);
  }
  // Only keep a placeholder at the top if its value is '' or 'all'
  let placeholderOption = null;
  if (options.length && (options[0].value === '' || options[0].value === 'all')) {
    placeholderOption = options.shift();
  }
  options.sort((a, b) => a.text.localeCompare(b.text));
  select.innerHTML = '';
  if (placeholderOption) select.appendChild(placeholderOption);
  options.forEach(opt => select.appendChild(opt));
  if (lastOption) select.appendChild(lastOption);
}

// Consolidated DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async function () {
  console.log(`DEBUG: Consolidated DOMContentLoaded fired. wishlistUserId: ${wishlistUserId}, currentUser: ${currentUser ? currentUser.uid : 'null'}`);

  // Define blogPostsContainer for use throughout this block
  const blogPostsContainer = document.getElementById('blog-posts');

  // Initialize posts listener to load Firestore posts
  initializePostsListener();

    let searchInput = document.getElementById("searchInput");
    let ratingFilter = document.getElementById("ratingFilter");
    let sortFilter = document.getElementById("sortFilter");
    let filterButtons = document.querySelectorAll("nav button");
    let darkModeToggle = document.getElementById("darkModeToggle");

  // Ensure category buttons apply filtering
    filterButtons.forEach(button => {
        button.addEventListener("click", function () {
          let category = this.getAttribute("data-category");
          
          // Remove active class from all buttons
          filterButtons.forEach(btn => btn.classList.remove('active'));
          
          // Add active class to clicked button
          this.classList.add('active');
          
            filterPosts(category);
        });
    });

    // Set "All" button as active by default
    const allButton = document.querySelector('nav button[data-category="all"]');
    if (allButton) {
        allButton.classList.add('active');
    }

  // Search bar event listener
    if (searchInput) searchInput.addEventListener("keyup", searchPosts);

  // Rating filter event listener
    if (ratingFilter) ratingFilter.addEventListener("change", filterByRating);

  // Sorting event listener
  // The sort filter change listener is now attached inside initializePostsListener
  // This ensures it's only active after initial data is loaded.
  // The listener attachment was moved inside the isInitialLoad block in initializePostsListener.

  // Load Dark Mode from `localStorage`
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

  // Load saved ratings
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
  // Only add the Add Post button if we are NOT in restaurants or wishlists section
  if (blogPostsContainer && blogPostsContainer.parentNode && !window.location.pathname.includes('restaurants') && !window.location.pathname.includes('wishlist')) {
    blogPostsContainer.parentNode.insertBefore(addPostBtn, blogPostsContainer);
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
    games: document.getElementById('postFieldsGames'),
    food: document.getElementById('postFieldsFood')
  };
  if (sectionSelect) {
      sectionSelect.addEventListener('change', function() {
        Object.keys(sectionFields).forEach(key => {
          if (sectionFields[key]) {
            sectionFields[key].style.display = (key === this.value) ? '' : 'none';
          }
        });
      });
  }
  // Cloudinary upload widget
  const uploadBtn = document.getElementById('uploadPostImageBtn');
  const imageUrlInput = document.getElementById('postImageUrlInput');
  const imagePreview = document.getElementById('postImagePreview');
  if (uploadBtn) {
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
  }
  // Submit logic (now save to Firestore and render post)
  const submitAddPostBtn = document.getElementById('submitAddPost');
  if (submitAddPostBtn) {
      submitAddPostBtn.addEventListener('click', async function() {
        const section = sectionSelect ? sectionSelect.value : '';
        let postData = {
          section,
          imageUrl: imageUrlInput ? imageUrlInput.value : '',
          created: new Date()
        };

        if (section === 'books') {
          postData.title = document.getElementById('postBookTitle')?.value.trim();
          postData.author = document.getElementById('postBookAuthor')?.value.trim();
          postData.genre = document.getElementById('postBookGenre')?.value.trim();
          postData.readingTime = document.getElementById('postBookReadingTime')?.value.trim();
          postData.totalWords = document.getElementById('postBookTotalWords')?.value.trim();
          postData.rating = document.getElementById('postBookRating')?.value.trim();
          postData.description = document.getElementById('postBookDescription')?.value.trim();
        } else if (section === 'movies') {
          postData.title = document.getElementById('postMovieTitle')?.value.trim();
          postData.director = document.getElementById('postMovieDirector')?.value.trim();
          postData.genre = document.getElementById('postMovieGenre')?.value.trim();
          postData.releaseDate = document.getElementById('postMovieReleaseDate')?.value.trim();
          postData.rating = document.getElementById('postMovieRating')?.value.trim();
          postData.description = document.getElementById('postMovieDescription')?.value.trim();
        } else if (section === 'tvshows') {
          postData.title = document.getElementById('postTVShowTitle')?.value.trim();
          postData.genre = document.getElementById('postTVShowGenre')?.value.trim();
          postData.finishedOn = document.getElementById('postTVShowFinishedOn')?.value.trim();
          postData.rating = document.getElementById('postTVShowRating')?.value.trim();
          postData.description = document.getElementById('postTVShowDescription')?.value.trim();
        } else if (section === 'games') {
          postData.title = document.getElementById('postGameTitle')?.value.trim();
          postData.developer = document.getElementById('postGameDeveloper')?.value.trim();
          postData.genre = document.getElementById('postGameGenre')?.value.trim();
          postData.releaseDate = document.getElementById('postGameReleaseDate')?.value.trim();
          postData.rating = document.getElementById('postGameRating')?.value.trim();
          postData.description = document.getElementById('postGameDescription')?.value.trim();
        } else if (section === 'food') {
          postData.title = document.getElementById('postFoodTitle')?.value.trim();
          postData.cuisine = document.getElementById('postFoodCuisine')?.value.trim();
          postData.cookingTime = document.getElementById('postFoodCookingTime')?.value.trim();
          postData.difficulty = document.getElementById('postFoodDifficulty')?.value;
          postData.rating = document.getElementById('postFoodRating')?.value.trim();
          postData.summary = document.getElementById('postFoodSummary')?.value.trim();
          postData.ingredients = document.getElementById('postFoodIngredients')?.value.trim();
          postData.instructions = document.getElementById('postFoodInstructions')?.value.trim();
          postData.finalThoughts = document.getElementById('postFoodFinalThoughts')?.value.trim();
        }
        try {
          console.log('Adding post to Firestore:', postData); // Debug log
          const docRef = await db.collection('posts').add(postData);
          postData.id = docRef.id;
          console.log('Post added successfully with ID:', docRef.id); // Debug log
          const article = createBlogPostCard(postData);
          if (article) {
            const blogPostsContainer = document.getElementById('blog-posts');
            blogPostsContainer.insertBefore(article, blogPostsContainer.firstChild);
          }
          alert('Post added successfully!');
          if (section === 'books') {
            calculateTotalWordCount();
          }
        } catch (e) {
          console.error('Error adding post:', e); // Debug log
          alert('Error adding post: ' + e.message);
        }
        if (addPostModal) addPostModal.classList.remove('show');
        // Reset form fields
        Object.values(sectionFields).forEach(field => {
          if (field) {
            const inputs = field.querySelectorAll('input, textarea, select');
            inputs.forEach(input => input.value = '');
          }
        });
        if (imageUrlInput) imageUrlInput.value = '';
        if (imagePreview) imagePreview.style.display = 'none';
      });
  }
  // Main Restaurant Modal Logic
  const addMainRestaurantBtn = document.getElementById('addMainRestaurantBtn');
  const addMainRestaurantModal = document.getElementById('addMainRestaurantModal');
  const closeAddMainRestaurantModal = document.getElementById('closeAddMainRestaurantModal');
  const mainRestaurantLocationSelect = document.getElementById('mainRestaurantLocationSelect');
  const mainRestaurantNewLocationContainer = document.getElementById('mainRestaurantNewLocationContainer');
  const mainRestaurantNewLocationInput = document.getElementById('mainRestaurantNewLocationInput');
  const mainRestaurantCuisineSelect = document.getElementById('mainRestaurantCuisineSelect');
  const mainRestaurantNewCuisineContainer = document.getElementById('mainRestaurantNewCuisineContainer');
  const mainRestaurantNewCuisineInput = document.getElementById('mainRestaurantNewCuisineInput');
  const submitAddMainRestaurantBtn = document.getElementById('submitAddMainRestaurant');

  // Show modal
  if (addMainRestaurantBtn && addMainRestaurantModal) {
      addMainRestaurantBtn.addEventListener('click', () => {
          populateMainRestaurantDropdowns(); // Always refresh before showing
          addMainRestaurantModal.classList.add('show');
      });
  }
  // Hide modal
  if (closeAddMainRestaurantModal && addMainRestaurantModal) {
      closeAddMainRestaurantModal.addEventListener('click', () => {
          addMainRestaurantModal.classList.remove('show');
      });
  }
  if (addMainRestaurantModal) {
      addMainRestaurantModal.addEventListener('mousedown', (e) => {
          if (e.target === addMainRestaurantModal) addMainRestaurantModal.classList.remove('show');
      });
  }
  // Show/hide new location input
  if (mainRestaurantLocationSelect && mainRestaurantNewLocationContainer) {
      mainRestaurantLocationSelect.addEventListener('change', function () {
          mainRestaurantNewLocationContainer.style.display = this.value === 'new-location' ? '' : 'none';
      });
  }
  // Show/hide new cuisine input
  if (mainRestaurantCuisineSelect && mainRestaurantNewCuisineContainer) {
      mainRestaurantCuisineSelect.addEventListener('change', function () {
          mainRestaurantNewCuisineContainer.style.display = this.value === 'new-cuisine' ? '' : 'none';
      });
  }
  // Submit logic
  if (submitAddMainRestaurantBtn) {
      submitAddMainRestaurantBtn.addEventListener('click', async function () {
          const name = document.getElementById('mainRestaurantNameInput')?.value.trim();
          let location = mainRestaurantLocationSelect?.value;
          if (location === 'new-location') location = mainRestaurantNewLocationInput?.value.trim();
          let cuisine = mainRestaurantCuisineSelect?.value;
          if (cuisine === 'new-cuisine') cuisine = mainRestaurantNewCuisineInput?.value.trim();
          const rating = document.getElementById('mainRestaurantRatingInput')?.value.trim();
          const price = document.getElementById('mainRestaurantPriceSelect')?.value;
          const menuLink = document.getElementById('mainRestaurantMenuLinkInput')?.value.trim();
          if (!name || !location || !cuisine) return;
          const slug = slugify(name);
          // Add to Firestore
          await db.collection('main_restaurants').add({
              name, location, cuisine, rating, price, menuLink, slug, created: new Date()
          });
          // Add to DOM at the bottom
          appendMainRestaurantToList({ name, location, cuisine, rating, price, menuLink, slug });
          // Reset form
          if (document.getElementById('mainRestaurantNameInput')) document.getElementById('mainRestaurantNameInput').value = '';
          if (mainRestaurantNewLocationInput) mainRestaurantNewLocationInput.value = '';
          if (mainRestaurantNewCuisineInput) mainRestaurantNewCuisineInput.value = '';
          if (document.getElementById('mainRestaurantRatingInput')) document.getElementById('mainRestaurantRatingInput').value = '';
          if (document.getElementById('mainRestaurantPriceSelect')) document.getElementById('mainRestaurantPriceSelect').selectedIndex = 0;
          if (document.getElementById('mainRestaurantMenuLinkInput')) document.getElementById('mainRestaurantMenuLinkInput').value = '';
          if (addMainRestaurantModal) addMainRestaurantModal.classList.remove('show');
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
  // Only initialize posts listener if it hasn't been initialized yet
  if (!window.postsListenerInitialized) {
    window.postsListenerInitialized = true;
    initializePostsListener();
  }
  alphabetizeSelectOptions('bookGenreSelect', 'new-section');
});