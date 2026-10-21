/* ==========================================================================
   MOVIEVERSE - JAVASCRIPT (script.js)
   Beginner-friendly JavaScript for rendering, searching, and filtering movies
   ========================================================================== */

/* --------------------------------------------------------------------------
   STEP 1: SAMPLE MOVIE DATA
   --------------------------------------------------------------------------
   In a full application, this data would come from an API or a database.
   For now, we use a JavaScript "Array" of "Objects" where each object
   represents one movie with its title, release year, language, and poster.
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   TMDB CONFIGURATION & POSTER URL HELPER
   --------------------------------------------------------------------------
   TMDB provides movie posters via its base URL: https://image.tmdb.org/t/p/w500/
   followed by each movie's unique poster_path. We safely handle missing or
   malformed values by falling back to a clean placeholder image.
   -------------------------------------------------------------------------- */
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500/";
const FALLBACK_POSTER_IMAGE = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80";

function getMoviePosterUrl(movie) {
  // If the movie has a valid poster_path, construct the full TMDB URL
  if (movie && typeof movie.poster_path === "string" && movie.poster_path.trim() !== "") {
    const cleanPath = movie.poster_path.trim().startsWith("/")
      ? movie.poster_path.trim().slice(1)
      : movie.poster_path.trim();
    return `${TMDB_IMAGE_BASE_URL}${cleanPath}`;
  }
  // Full poster URLs (already resolved by the backend) take priority next
  if (movie && typeof movie.posterUrl === "string" && movie.posterUrl.trim() !== "") {
    return movie.posterUrl.trim();
  }
  // If a full poster URL is already provided on the object, use it
  if (movie && typeof movie.poster === "string" && movie.poster.trim() !== "") {
    return movie.poster.trim();
  }
  // Safe fallback if poster_path / posterUrl / poster are all missing
  return FALLBACK_POSTER_IMAGE;
}

const sampleMovies = [
  {
    id: 1,
    title: "Inception",
    year: 2010,
    language: "English",
    poster_path: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    poster: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    overview: "Cobb, a skilled thief who steals corporate secrets through dream-sharing technology, is given the inverse task of planting an idea into the mind of a CEO.",
    rating: "8.4"
  },
  {
    id: 2,
    title: "Parasite",
    year: 2019,
    language: "Korean",
    poster_path: "/ewYKKryWmTUSy2SL8h5EpdJgGX.jpg",
    poster: "https://image.tmdb.org/t/p/w500/ewYKKryWmTUSy2SL8h5EpdJgGX.jpg",
    overview: "All unemployed, Ki-taek's family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.",
    rating: "8.5"
  },
  {
    id: 3,
    title: "Spirited Away",
    year: 2001,
    language: "Japanese",
    poster_path: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    poster: "https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    overview: "A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had.",
    rating: "8.5"
  },
  {
    id: 4,
    title: "RRR",
    year: 2022,
    language: "Hindi",
    poster_path: "/wE0I6efAW4cDDmZQWtwZMOW44EJ.jpg",
    poster: "https://image.tmdb.org/t/p/w500/wE0I6efAW4cDDmZQWtwZMOW44EJ.jpg",
    overview: "A fictional history of two legendary revolutionaries' journey away from home before they began fighting for their country in the 1920s.",
    rating: "7.8"
  },
  {
    id: 5,
    title: "Pan's Labyrinth",
    year: 2006,
    language: "Spanish",
    poster_path: "/7wb2Ldp0oAx1lcZvffq9RfWoI2h.jpg",
    poster: "https://image.tmdb.org/t/p/w500/7wb2Ldp0oAx1lcZvffq9RfWoI2h.jpg",
    overview: "In the falangist Spain of 1944, the bookish young stepdaughter of a sadistic army officer escapes into an eerie but captivating fantasy world.",
    rating: "7.7"
  },
  {
    id: 6,
    title: "Train to Busan",
    year: 2016,
    language: "Korean",
    poster_path: "/vNVFt6dtcqnI7hqa6LFBUibuFiw.jpg",
    poster: "https://image.tmdb.org/t/p/w500/vNVFt6dtcqnI7hqa6LFBUibuFiw.jpg",
    overview: "When a zombie virus breaks out in South Korea, passengers struggle to survive on the high-speed train from Seoul to Busan.",
    rating: "7.8"
  }
];
let currentMovies = sampleMovies;
let popularMovies = sampleMovies;
let searchTimer;
let searchRequestId = 0;

/* --------------------------------------------------------------------------
   STEP 2: SELECT HTML ELEMENTS FROM THE DOM
   --------------------------------------------------------------------------
   We use `document.getElementById` to grab references to the HTML tags 
   we want to read from or modify using JavaScript.
   -------------------------------------------------------------------------- */
const moviesGrid = document.getElementById("moviesGrid");
const searchInput = document.getElementById("searchInput");
const languageSelect = document.getElementById("languageSelect");
const movieCount = document.getElementById("movieCount");
const noResults = document.getElementById("noResults");
const noResultsTitle = document.getElementById("noResultsTitle");
const noResultsText = document.getElementById("noResultsText");
const resetBtn = document.getElementById("resetBtn");
const resultsStatus = document.getElementById("resultsStatus");
const resultsStatusText = document.getElementById("resultsStatusText");
const resultsSectionTitle = document.getElementById("resultsSectionTitle");
const freeMoviesSection = document.getElementById("free-movies");
const navLinksList = document.getElementById("navLinks");
const navToggle = document.getElementById("navToggle");
const loadMoreFreeBtn = document.getElementById("loadMoreFreeBtn");

let isShowingSearchResults = false;

/* --------------------------------------------------------------------------
   STEP 3: FUNCTION TO RENDER MOVIE CARDS ONTO THE PAGE
   --------------------------------------------------------------------------
   This function takes an array of movie objects and turns them into
   HTML movie cards inside the #moviesGrid container.
   -------------------------------------------------------------------------- */
function showResultsStatus(message) {
  if (!resultsStatus) return;
  if (resultsStatusText) resultsStatusText.textContent = message;
  resultsStatus.classList.remove("hidden");
}

function hideResultsStatus() {
  if (resultsStatus) resultsStatus.classList.add("hidden");
}

function showNoResultsMessage(title, message) {
  if (noResultsTitle) noResultsTitle.textContent = title;
  if (noResultsText) noResultsText.textContent = message;
  noResults.classList.remove("hidden");
}

function setSearchLayout(isSearching, query) {
  if (freeMoviesSection) {
    freeMoviesSection.classList.toggle("hidden", isSearching);
  }

  if (resultsSectionTitle) {
    resultsSectionTitle.textContent = isSearching
      ? `Search Results${query ? ` for "${query}"` : ""}`
      : "Popular Movies";
  }
}

function isSearchQueryActive() {
  return searchInput.value.trim() !== "";
}

function displayMovies(moviesToDisplay) {
  // Clear any existing movies currently inside the grid
  moviesGrid.innerHTML = "";
  hideResultsStatus();

  // Update the count label (e.g., "Showing 6 movies")
  movieCount.textContent = `Showing ${moviesToDisplay.length} movie${moviesToDisplay.length === 1 ? "" : "s"}`;

  // If no movies match the search/filter, show the "No Results" message
  if (moviesToDisplay.length === 0) {
    showNoResultsMessage(
      "No movies found",
      isShowingSearchResults
        ? "No matching titles were returned. Try a different search or reset your language filter."
        : "Try searching for a different title or resetting your language filter."
    );
    return;
  } else {
    noResults.classList.add("hidden");
  }

  // Loop through each movie in the array and create its HTML card
  moviesToDisplay.forEach((movie) => {
    // Safely build the poster URL using TMDB base URL + poster_path
    const posterUrl = getMoviePosterUrl(movie);

    // 1. Create a container <div> for the card
    const card = document.createElement("div");
    card.classList.add("movie-card");

    // 2. Populate the card HTML using template literals (backticks ``)
    card.innerHTML = `
      <div class="poster-container">
        <img 
          src="${posterUrl}" 
          alt="${movie.title} Poster" 
          class="movie-poster" 
          loading="lazy"
          onerror="this.src='${FALLBACK_POSTER_IMAGE}'"
        >
      </div>
      <div class="movie-info">
        <h3 class="movie-title" title="${movie.title}">${movie.title}</h3>
        <div class="movie-meta">
          <span class="movie-year">${movie.year}</span>
          <span class="language-badge">${movie.language}</span>
        </div>
        <button type="button" class="watch-btn" data-movie-id="${movie.id}" aria-label="Watch options for ${movie.title}">
          <span class="play-icon">▶</span> Where to Watch
        </button>
      </div>
    `;

    // 3. Append the card to the grid container
    moviesGrid.appendChild(card);
  });
}

/* --------------------------------------------------------------------------
   STEP 4: FUNCTION TO FILTER MOVIES (SEARCH + LANGUAGE)
   --------------------------------------------------------------------------
   This function runs whenever the user types in the search bar OR
   picks a different language from the dropdown menu.
   -------------------------------------------------------------------------- */


function filterMovies() {
  const searchTerm = searchInput.value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const selectedLanguage = languageSelect.value;

  const filtered = currentMovies.filter((movie) => {
    const matchesLanguage =
      selectedLanguage === "all" ||
      movie.language === selectedLanguage;

    // TMDB already matched the query (including punctuation-insensitive titles).
    // Keep language filtering, but do not hide genuine TMDB matches.
    if (isShowingSearchResults) {
      return matchesLanguage;
    }

    const normalizedTitle = (movie.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const matchesSearch = !searchTerm || normalizedTitle.includes(searchTerm);
    return matchesSearch && matchesLanguage;
  });

  displayMovies(filtered);
}



/* --------------------------------------------------------------------------
   STEP 5: EVENT LISTENERS
   --------------------------------------------------------------------------
   Connect the HTML controls to the filterMovies function:
   - "input" fires on every keystroke when typing in the search bar
   - "keydown" listens for the Escape key to quickly clear search
   - "change" fires whenever a new option is chosen in the dropdown
   - "click" on the Reset Filters button clears both search and language
   -------------------------------------------------------------------------- */


let searchController = null;

function cancelCurrentSearch() {
  searchRequestId++;

  if (searchController) {
    searchController.abort();
    searchController = null;
  }
}

function resetToPopularMovies() {
  clearTimeout(searchTimer);
  cancelCurrentSearch();

  searchInput.value = "";
  isShowingSearchResults = false;
  currentMovies = popularMovies;
  setSearchLayout(false);

  loadMoreBtn.hidden = currentPage >= totalPages;
  filterMovies();
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  cancelCurrentSearch();

  const query = searchInput.value.trim();

  if (!query) {
    isShowingSearchResults = false;
    currentMovies = popularMovies;
    setSearchLayout(false);
    loadMoreBtn.hidden = currentPage >= totalPages;
    filterMovies();
    return;
  }

  isShowingSearchResults = true;
  setSearchLayout(true, query);
  loadMoreBtn.hidden = true;
  moviesGrid.innerHTML = "";
  noResults.classList.add("hidden");
  movieCount.textContent = `Searching for "${query}"...`;
  showResultsStatus(`Searching for "${query}"...`);

  searchTimer = setTimeout(() => {
    searchTmdbMovies(query);
  }, 400);
});

languageSelect.addEventListener("change", filterMovies);

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (watchModal && !watchModal.classList.contains("hidden")) {
      return;
    }
    resetToPopularMovies();
  }
});

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    languageSelect.value = "all";
    resetToPopularMovies();
  });
}



/* --------------------------------------------------------------------------
   STEP 6: INITIAL DISPLAY
   --------------------------------------------------------------------------
   When the website first loads, display all 6 sample movies right away!
   -------------------------------------------------------------------------- */

/* STEP 6: LOAD POPULAR MOVIES FROM SPRING BOOT */

const languageNames = {
  en: "English",
  es: "Spanish",
  hi: "Hindi",
  kn: "Kannada",
  ko: "Korean",
  ja: "Japanese",
  te: "Telugu",
  ta: "Tamil",
  ml: "Malayalam",
  zh: "Chinese",
  fr: "French",
  de: "German"
};



async function searchTmdbMovies(query) {
  const requestId = ++searchRequestId;
  const controller = new AbortController();
  searchController = controller;

  const tmdbUrl = `https://movieverse-b9cy.onrender.com/api/movies/search?query=${encodeURIComponent(query)}&page=1`;
  const freeUrl = `https://movieverse-b9cy.onrender.com/api/movies/free/search?query=${encodeURIComponent(query)}`;

  // Discover titles through TMDB (across all languages) and, independently,
  // look up rights-verified free copies. Free playback stays a separate
  // concept from discoverability: a result is only marked free when the
  // backend confirms a verified copy. Search is never restricted to the free
  // catalog.
  const [tmdbOutcome, freeOutcome] = await Promise.allSettled([
    fetch(tmdbUrl, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`Search failed: HTTP ${response.status}`);
      return response.json();
    }),
    fetch(freeUrl, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`Free search failed: HTTP ${response.status}`);
      return response.json();
    })
  ]);

  if (controller.signal.aborted) return;
  if (requestId !== searchRequestId || searchInput.value.trim() !== query) return;

  // Verified free copies, keyed by their TMDB id.
  const freeById = new Map();
  if (freeOutcome.status === "fulfilled" && Array.isArray(freeOutcome.value)) {
    freeOutcome.value.forEach((movie) => {
      if (movie && movie.id != null) freeById.set(String(movie.id), movie);
    });
  }

  const tmdbOk =
    tmdbOutcome.status === "fulfilled" &&
    tmdbOutcome.value &&
    Array.isArray(tmdbOutcome.value.results);

  if (!tmdbOk && freeById.size === 0) {
    console.error(
      "Movie search failed:",
      tmdbOutcome.status === "rejected" ? tmdbOutcome.reason : "invalid API response"
    );
    moviesGrid.innerHTML = "";
    hideResultsStatus();
    movieCount.textContent = "Search unsuccessful";
    showNoResultsMessage(
      "Search unsuccessful",
      "Could not load movies. Make sure the MovieVerse server is running and try again."
    );
    searchController = null;
    return;
  }

  const results = [];

  if (tmdbOk) {
    tmdbOutcome.value.results.forEach((movie) => {
      const freeCopy = freeById.get(String(movie.id));
      results.push({
        id: movie.id,
        title: movie.title || "Untitled",
        year: movie.release_date ? movie.release_date.substring(0, 4) : "Unknown",
        language: languageNames[movie.original_language] || "Other",
        poster_path: movie.poster_path,
        overview: movie.overview || "No overview available for this title.",
        rating: movie.vote_average ? Number(movie.vote_average).toFixed(1) : "N/A",
        // Only claim "free" when the backend verified a playable copy.
        isFreeMovie: Boolean(freeCopy && freeCopy.playable),
        embedUrl: freeCopy ? freeCopy.embedUrl : null,
        sourceUrl: freeCopy ? freeCopy.sourceUrl : null,
        playbackStatus: freeCopy ? freeCopy.playbackStatus : null
      });
    });
  }

  // Include verified free titles that TMDB's title search did not surface.
  freeById.forEach((freeCopy) => {
    if (results.some((movie) => String(movie.id) === String(freeCopy.id))) return;
    results.push({
      id: freeCopy.id,
      title: freeCopy.title || "Untitled",
      year: freeCopy.year ? String(freeCopy.year) : "Unknown",
      language: freeCopy.language || "Other",
      poster_path: freeCopy.posterPath || null,
      posterUrl: freeCopy.posterUrl || null,
      overview: freeCopy.overview || "No overview available for this title.",
      rating: freeCopy.rating || "N/A",
      isFreeMovie: Boolean(freeCopy.playable),
      embedUrl: freeCopy.embedUrl,
      sourceUrl: freeCopy.sourceUrl,
      playbackStatus: freeCopy.playbackStatus
    });
  });

  currentMovies = results;
  isShowingSearchResults = true;
  setSearchLayout(true, query);
  loadMoreBtn.hidden = true;
  filterMovies();
  searchController = null;
}


let currentPage = 0;
let totalPages = 1;
let isLoading = false;

const loadMoreBtn = document.getElementById("loadMoreBtn");

async function loadPopularMovies(page = 1) {
  if (isLoading || page > totalPages) {
    return;
  }

  isLoading = true;
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = "Loading...";

  try {
    const response = await fetch(
      `https://movieverse-b9cy.onrender.com/api/movies/popular?page=${page}`
    );

    if (!response.ok) {
      throw new Error("Request failed: " + response.status);
    }

    const data = await response.json();

    const newMovies = data.results.map((movie) => ({
      id: movie.id,
      title: movie.title || "Untitled",
      year: movie.release_date
        ? movie.release_date.substring(0, 4)
        : "Unknown",
      language:
        languageNames[movie.original_language] || "Other",
      poster_path: movie.poster_path,
      overview: movie.overview || "No overview available for this title.",
      rating: movie.vote_average ? Number(movie.vote_average).toFixed(1) : "N/A"
    }));

    if (page === 1) {
      popularMovies = newMovies;
    } else {
      const existingIds = new Set(popularMovies.map((movie) => movie.id));
      const uniqueNewMovies = newMovies.filter((movie) => !existingIds.has(movie.id));
      popularMovies = [...popularMovies, ...uniqueNewMovies];
    }

    currentPage = data.page;
    totalPages = data.total_pages;

    // Never overwrite an active TMDB search with popular results.
    if (!isSearchQueryActive() && !isShowingSearchResults) {
      currentMovies = popularMovies;
      filterMovies();
      loadMoreBtn.hidden = currentPage >= totalPages;
    } else {
      loadMoreBtn.hidden = true;
    }

  } catch (error) {
    console.error("Failed to load movies:", error);
    if (!isSearchQueryActive()) {
      loadMoreBtn.textContent = "Retry Loading Movies";
      loadMoreBtn.hidden = false;
    }

  } finally {
    isLoading = false;

    if (currentPage < totalPages) {
      loadMoreBtn.disabled = false;

      if (loadMoreBtn.textContent === "Loading...") {
        loadMoreBtn.textContent = "Load More Movies";
      }
    }
  }
}

loadMoreBtn.addEventListener("click", () => {
  if (isSearchQueryActive() || isShowingSearchResults) {
    return;
  }
  loadPopularMovies(currentPage + 1);
});

// Initial lists are loaded after the remaining helpers are defined.

/* ==========================================================================
   STEP 7: WATCH FREE & LEGALLY MOVIES & IN-APP PLAYBACK
   ========================================================================== */

// The free catalog is served exclusively by the backend
// (/api/movies/free), which only contains human-verified identifiers.
// No client-side catalog is kept here so that no guessed archive.org
// identifiers can ever reach the player.
let freeMovies = []; // filled only from the backend API

const freeMoviesGrid = document.getElementById("freeMoviesGrid");
const freeMovieCount = document.getElementById("freeMovieCount");
const featuredFreeMovies = document.getElementById("featuredFreeMovies");

const watchModal = document.getElementById("watchModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalMoviePoster = document.getElementById("modalMoviePoster");
const modalMovieTitle = document.getElementById("modalMovieTitle");
const modalMovieYear = document.getElementById("modalMovieYear");
const modalMovieLanguage = document.getElementById("modalMovieLanguage");
const modalMovieRating = document.getElementById("modalMovieRating");
const modalMovieOverview = document.getElementById("modalMovieOverview");

const modalPlayerSection = document.getElementById("modalPlayerSection");
const modalVideoPlayer = document.getElementById("modalVideoPlayer");
const modalQualitySelect = document.getElementById("modalQualitySelect");
const modalQualityLabel = document.getElementById("modalQualityLabel");
const modalQualityNote = document.getElementById("modalQualityNote");
const modalSourceLink = document.getElementById("modalSourceLink");
const modalRightsReason = document.getElementById("modalRightsReason");
const modalRightsLicense = document.getElementById("modalRightsLicense");
const modalPlaybackNotice = document.getElementById("modalPlaybackNotice");

const modalLoading = document.getElementById("modalLoading");
const modalError = document.getElementById("modalError");
const modalErrorMessage = document.getElementById("modalErrorMessage");
const modalRetryBtn = document.getElementById("modalRetryBtn");
const modalEmpty = document.getElementById("modalEmpty");
const modalEmptyMessage = document.getElementById("modalEmptyMessage");
const modalProvidersContent = document.getElementById("modalProvidersContent");
const modalPrimaryAction = document.getElementById("modalPrimaryAction");
const modalTmdbWatchLink = document.getElementById("modalTmdbWatchLink");

const fallbackPlayerWrapper = document.getElementById("fallbackPlayerWrapper");

/* Custom Video Player Elements */
const customVideoPlayer = document.getElementById("customVideoPlayer");
const videoElement = document.getElementById("videoElement");
const playerControls = document.getElementById("playerControls");
const playPauseBtn = document.getElementById("playPauseBtn");
const rewindBtn = document.getElementById("rewindBtn");
const forwardBtn = document.getElementById("forwardBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeSlider = document.getElementById("volumeSlider");
const progressSlider = document.getElementById("progressSlider");
const progressFill = document.getElementById("progressFill");
const progressBuffer = document.getElementById("progressBuffer");
const currentTimeDisplay = document.getElementById("currentTime");
const durationDisplay = document.getElementById("duration");
const speedBtn = document.getElementById("speedBtn");
const speedDisplay = document.getElementById("speedDisplay");
const pipBtn = document.getElementById("pipBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const playerTitle = document.getElementById("playerTitle");
const playerLoading = document.getElementById("playerLoading");
const playerError = document.getElementById("playerError");
const playerErrorMessage = document.getElementById("playerErrorMessage");
const playerRetryBtn = document.getElementById("playerRetryBtn");
const playerStatusText = document.getElementById("playerStatusText");

let playerIdleTimeout;
let currentPlaybackSpeed = 1;
let currentVideoSource = null;

let activeModalMovie = null;
let watchProvidersController = null;
let archiveMetadataController = null;

function createFreeMovieCard(movie) {
  const posterUrl = getMoviePosterUrl(movie);
  const card = document.createElement("div");
  card.classList.add("movie-card", "free-card");
  card.dataset.movieId = String(movie.id);

  // Trust the backend's verified `playable` flag. Only fall back to the
  // presence of an embed URL for objects that predate that flag.
  const isPlayable =
    movie.playable === true ||
    (movie.playable === undefined && Boolean(movie.embedUrl));
  const buttonText = isPlayable
    ? `<span class="play-icon">▶</span> Play Movie (Free)`
    : `<span class="play-icon">🔗</span> Where to Watch`;
  const badgeText = isPlayable ? "Free to Stream" : "Check Availability";

  card.innerHTML = `
    <div class="poster-container">
      <span class="free-play-badge">${badgeText}</span>
      <img
        src="${posterUrl}"
        alt="${escapeHtml(movie.title)} Poster"
        class="movie-poster"
        loading="lazy"
        onerror="this.src='${FALLBACK_POSTER_IMAGE}'"
      >
    </div>
    <div class="movie-info">
      <h3 class="movie-title" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</h3>
      <div class="movie-meta">
        <span class="movie-year">${movie.year}${movie.duration ? ` • ${escapeHtml(movie.duration)}` : ""}</span>
        <span class="language-badge">${escapeHtml(movie.language)}</span>
      </div>
      <button type="button" class="play-now-btn" data-movie-id="${movie.id}" aria-label="${isPlayable ? 'Play' : 'View details for'} ${escapeHtml(movie.title)}">
        ${buttonText}
      </button>
    </div>
  `;

  return card;
}

const FREE_MOVIES_API = "https://movieverse-b9cy.onrender.com/api/movies/free";
let freeMoviesPage = 0;          // last page successfully loaded from backend
let freeMoviesHasMore = true;    // false once backend returns no new movies
let freeMoviesLoading = false;   // guards against overlapping requests
let freeMoviesError = null;

function updateFreeMovieCount() {
  if (!freeMovieCount) return;
  const total = freeMovies.length;
  freeMovieCount.textContent =
    total === 0
      ? "0 verified films"
      : `Showing ${total} verified film${total === 1 ? "" : "s"}`;
}

function updateFreeLoadMoreButton() {
  if (!loadMoreFreeBtn) return;
  loadMoreFreeBtn.classList.remove("hidden");

  if (freeMoviesLoading) {
    loadMoreFreeBtn.disabled = true;
    loadMoreFreeBtn.textContent = "Loading free movies…";
    return;
  }
  if (freeMoviesError) {
    loadMoreFreeBtn.disabled = false;
    loadMoreFreeBtn.textContent = "Couldn't load free movies — Retry";
    return;
  }
  if (!freeMoviesHasMore) {
    loadMoreFreeBtn.disabled = true;
    loadMoreFreeBtn.textContent = "All verified films are shown";
    loadMoreFreeBtn.classList.add("hidden");

    // Show end-of-catalog message
    showEndOfCatalogMessage();
    return;
  }
  loadMoreFreeBtn.disabled = false;
  loadMoreFreeBtn.textContent = "Load More Free Movies";
}

function showEndOfCatalogMessage() {
  if (!freeMoviesGrid) return;
  let messageBox = document.getElementById("endOfCatalogMessage");
  if (!messageBox) {
    messageBox = document.createElement("div");
    messageBox.id = "endOfCatalogMessage";
    messageBox.className = "end-of-catalog-message";
    freeMoviesGrid.insertAdjacentElement("afterend", messageBox);
  }
  messageBox.innerHTML = `
    <p class="end-catalog-text">You've reached the end of our free movie collection.</p>
    <button type="button" id="explorePopularBtn" class="explore-popular-btn">Explore Popular Movies</button>
  `;

  const exploreBtn = document.getElementById("explorePopularBtn");
  if (exploreBtn) {
    exploreBtn.addEventListener("click", () => {
      resetToPopularMovies();
      scrollToSection("#popular");
    });
  }
}

function renderFeaturedFreeMovies(movies) {
  const featuredContainer = document.getElementById("featuredFreeMovies");
  if (!featuredContainer) return;

  // Select first 4 movies that have embedUrl (playable)
  const playableMovies = movies.filter(m => m.embedUrl).slice(0, 4);

  if (playableMovies.length === 0) {
    featuredContainer.classList.add("hidden");
    return;
  }

  featuredContainer.innerHTML = "";
  playableMovies.forEach(movie => {
    const card = createFreeMovieCard(movie);
    featuredContainer.appendChild(card);
  });
}

function showFreeMoviesError(message) {
  if (!freeMoviesGrid) return;
  let box = document.getElementById("freeMoviesError");
  if (!message) {
    if (box) box.remove();
    // Also remove end-of-catalog message when loading new content
    let endMessage = document.getElementById("endOfCatalogMessage");
    if (endMessage) endMessage.remove();
    return;
  }
  if (!box) {
    box = document.createElement("p");
    box.id = "freeMoviesError";
    box.className = "movie-count";
    box.setAttribute("role", "alert");
    freeMoviesGrid.insertAdjacentElement("afterend", box);
  }
  box.textContent = message;
}

// Appends only movies not already rendered (dedupe by ID).
function displayFreeMovies(moviesToAdd, reset = false) {
  if (!freeMoviesGrid) return;
  if (reset) freeMoviesGrid.innerHTML = "";

  const renderedIds = new Set(
    Array.from(freeMoviesGrid.querySelectorAll("[data-movie-id]")).map(
      (el) => el.getAttribute("data-movie-id")
    )
  );
  moviesToAdd.forEach((movie) => {
    if (renderedIds.has(String(movie.id))) return;
    freeMoviesGrid.appendChild(createFreeMovieCard(movie));
    renderedIds.add(String(movie.id));
  });
  updateFreeMovieCount();
  updateFreeLoadMoreButton();
}

async function loadFreeMovies(page = freeMoviesPage + 1) {
  if (freeMoviesLoading) return;
  freeMoviesLoading = true;
  freeMoviesError = null;
  showFreeMoviesError(null);
  updateFreeLoadMoreButton();

  try {
    const response = await fetch(`${FREE_MOVIES_API}?page=${page}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();

    // Support either a plain array or a paginated { results, page, total_pages } object.
    const results = Array.isArray(data)
      ? data
      : data && Array.isArray(data.results)
        ? data.results
        : null;
    if (!results) throw new Error("Unexpected response format");

    const mapped = results.map((movie) => ({
      ...movie,
      id: movie.id ?? movie.sourceIdentifier,
      poster_path: movie.poster_path ?? movie.posterPath,
      poster: movie.poster ?? movie.posterUrl
    }));

    const existingIds = new Set(freeMovies.map((m) => String(m.id)));
    const newMovies = mapped.filter((m) => !existingIds.has(String(m.id)));
    freeMovies = [...freeMovies, ...newMovies];
    freeMoviesPage = page;

    // End of results: empty page, only duplicates, or backend says last page.
    const totalPages = !Array.isArray(data) && data
      ? data.total_pages ?? data.totalPages
      : undefined;
    const isLast = !Array.isArray(data) && data && (data.last === true || data.hasMore === false);
    freeMoviesHasMore =
      newMovies.length > 0 &&
      !isLast &&
      !(typeof totalPages === "number" && page >= totalPages);

    freeMoviesLoading = false;
    displayFreeMovies(newMovies, page === 1);

    // Render featured section on first load
    
  } catch (error) {
    console.error("Failed to load Free Movies:", error);
    freeMoviesLoading = false;
    freeMoviesError = error;
    showFreeMoviesError(
      `Couldn't load free movies (${error.message}). Make sure the MovieVerse server is running, then press Retry.`
    );
    updateFreeLoadMoreButton();
  }
}



function findMovieById(movieId) {
  const idNum = Number(movieId);
  return (
    freeMovies.find((m) => m.id === idNum) ||
    currentMovies.find((m) => m.id === idNum) ||
    popularMovies.find((m) => m.id === idNum) ||
    sampleMovies.find((m) => m.id === idNum) ||
    null
  );
}

/**
 * Shows an honest, title-specific message when no rights-verified free stream
 * exists. Never implies that a broken or missing video is playable.
 */
function setPlaybackNotice(movie) {
  if (!modalPlaybackNotice) return;
  const textEl = modalPlaybackNotice.querySelector(".notice-text");
  if (!textEl) return;

  const status =
    (movie && movie.playbackStatus) ||
    "Free in-app playback is not available for this title because no rights-verified copy was found. Use the official options below to watch it legally.";

  const sourceLink =
    movie && movie.sourceUrl
      ? ` <a href="${movie.sourceUrl}" target="_blank" rel="noopener noreferrer">Open the official source page ↗</a>`
      : "";

  textEl.innerHTML = `<strong>Playback not offered:</strong> ${escapeHtml(status)}${sourceLink}`;
}

async function openWatchModal(movie) {
  if (!movie) return;
  activeModalMovie = movie;

  // Immediately populate movie header with local movie information
  modalMovieTitle.textContent = movie.title;
  modalMovieYear.textContent = movie.year ? `${movie.year}${movie.duration ? ` • ${movie.duration}` : ""}` : "Unknown";
  modalMovieLanguage.textContent = movie.language || "Other";
  modalMovieRating.textContent = `★ ${movie.rating || "N/A"}`;
  modalMovieOverview.textContent = movie.overview || "No synopsis available for this film.";

  modalMoviePoster.src = getMoviePosterUrl(movie);
  modalMoviePoster.alt = `${movie.title} Poster`;

  resetPlayerQualityUi();

  // In-App Video Player handling for legally available free movies
  if (movie.embedUrl) {
    if (modalPlayerSection) modalPlayerSection.classList.remove("hidden");
    if (modalPlaybackNotice) modalPlaybackNotice.classList.add("hidden");

    // Check if we can use the custom player with a direct video URL
    const directUrl = await getDirectVideoUrlFromArchive(movie);
    if (directUrl && isDirectVideoUrl(directUrl)) {
      if (customVideoPlayer) customVideoPlayer.classList.remove("hidden");
      if (fallbackPlayerWrapper) fallbackPlayerWrapper.classList.add("hidden");
      loadVideoIntoCustomPlayer(movie, directUrl);
      if (modalSourceLink) modalSourceLink.href = movie.sourceUrl || movie.embedUrl;
      if (modalRightsReason) modalRightsReason.textContent = movie.legalStatusReason || "Public domain verified.";
      if (modalRightsLicense) modalRightsLicense.textContent = movie.license || "Public Domain";
      setupPlayerQualityOptions(movie);
    } else {
      // Fall back to iframe embed for non-direct sources
      if (customVideoPlayer) customVideoPlayer.classList.add("hidden");
      if (fallbackPlayerWrapper) fallbackPlayerWrapper.classList.remove("hidden");
      if (modalVideoPlayer) modalVideoPlayer.src = movie.embedUrl;
      if (modalSourceLink) modalSourceLink.href = movie.sourceUrl || movie.embedUrl;
      if (modalRightsReason) modalRightsReason.textContent = movie.legalStatusReason || "Public domain verified.";
      if (modalRightsLicense) modalRightsLicense.textContent = movie.license || "Public Domain";
      setupPlayerQualityOptions(movie);
    }
  } else {
    if (modalPlayerSection) modalPlayerSection.classList.add("hidden");
    if (modalPlaybackNotice) modalPlaybackNotice.classList.remove("hidden");
    if (customVideoPlayer) customVideoPlayer.classList.add("hidden");
    if (fallbackPlayerWrapper) fallbackPlayerWrapper.classList.add("hidden");
    if (modalVideoPlayer) modalVideoPlayer.src = "";
    setPlaybackNotice(movie);
  }

  // Reveal modal overlay
  watchModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  if (modalCloseBtn) modalCloseBtn.focus();

  // Fetch watch providers for this movie
  loadWatchProviders(movie.id);
}

function closeWatchModal() {
  if (!watchModal) return;
  watchModal.classList.add("hidden");
  document.body.classList.remove("modal-open");

  // Immediately terminate video playback so audio stops
  if (modalVideoPlayer) {
    modalVideoPlayer.src = "";
  }
  resetPlayerQualityUi();
  resetPlayerControls();

  if (archiveMetadataController) {
    archiveMetadataController.abort();
    archiveMetadataController = null;
  }

  if (watchProvidersController) {
    watchProvidersController.abort();
    watchProvidersController = null;
  }
  activeModalMovie = null;
}

async function loadWatchProviders(movieId) {
  if (watchProvidersController) {
    watchProvidersController.abort();
  }
  const controller = new AbortController();
  watchProvidersController = controller;

  // Reset state indicators
  modalLoading.classList.remove("hidden");
  modalError.classList.add("hidden");
  modalEmpty.classList.add("hidden");
  modalPrimaryAction.classList.add("hidden");
  modalProvidersContent.innerHTML = "";

  try {
    const response = await fetch(
      `https://movieverse-b9cy.onrender.com/api/movies/${movieId}/watch-providers?region=IN`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    modalLoading.classList.add("hidden");

    // Configure primary JustWatch / TMDB watch link
    if (data.link) {
      modalTmdbWatchLink.href = data.link;
      modalPrimaryAction.classList.remove("hidden");
    }

    if (data.hasProviders && Array.isArray(data.categories) && data.categories.length > 0) {
      modalEmpty.classList.add("hidden");
      renderProviderCategories(data.categories, data.link);
    } else {
      modalEmptyMessage.textContent =
        data.message || "No official streaming providers are currently listed for this title in India (IN).";
      modalEmpty.classList.remove("hidden");
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("Failed to fetch watch providers:", err);
    modalLoading.classList.add("hidden");
    modalErrorMessage.textContent =
      "Unable to fetch streaming availability. Please verify the backend service is running.";
    modalError.classList.remove("hidden");
  } finally {
    watchProvidersController = null;
  }
}

function renderProviderCategories(categories, fallbackLink) {
  modalProvidersContent.innerHTML = "";

  categories.forEach((category) => {
    const block = document.createElement("div");
    block.classList.add("provider-category-block");

    const titleBar = document.createElement("div");
    titleBar.classList.add("category-title-bar");
    titleBar.innerHTML = `
      <span class="category-name">${escapeHtml(category.name)}</span>
      <span class="category-badge-count">${category.providers.length}</span>
    `;

    const grid = document.createElement("div");
    grid.classList.add("providers-grid");

    category.providers.forEach((provider) => {
      const link = document.createElement("a");
      link.href = provider.officialUrl || fallbackLink || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.classList.add("provider-card-link");
      link.title = `Watch on ${provider.providerName} (Official Platform)`;

      const logoSrc = provider.logoUrl || FALLBACK_POSTER_IMAGE;
      link.innerHTML = `
        <img 
          src="${logoSrc}" 
          alt="${escapeHtml(provider.providerName)}" 
          class="provider-logo-img" 
          onerror="this.src='${FALLBACK_POSTER_IMAGE}'"
        >
        <span class="provider-name-text">${escapeHtml(provider.providerName)}</span>
        <span class="provider-ext-icon">↗</span>
      `;

      grid.appendChild(link);
    });

    block.appendChild(titleBar);
    block.appendChild(grid);
    modalProvidersContent.appendChild(block);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resetPlayerQualityUi() {
  if (modalQualitySelect) {
    modalQualitySelect.innerHTML = "";
    modalQualitySelect.classList.add("hidden");
    modalQualitySelect.onchange = null;
  }
  if (modalQualityLabel) modalQualityLabel.classList.add("hidden");
  if (modalQualityNote) modalQualityNote.textContent = "";
}

/* ==========================================================================
   CUSTOM VIDEO PLAYER FUNCTIONS
   ========================================================================== */

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showPlayerLoading() {
  if (playerLoading) playerLoading.classList.remove("hidden");
  if (playerError) playerError.classList.add("hidden");
}

function hidePlayerLoading() {
  if (playerLoading) playerLoading.classList.add("hidden");
}

function showPlayerError(message) {
  if (playerError) {
    playerError.classList.remove("hidden");
    if (playerErrorMessage) playerErrorMessage.textContent = message;
  }
  if (playerLoading) playerLoading.classList.add("hidden");
}

function hidePlayerError() {
  if (playerError) playerError.classList.add("hidden");
}

function resetPlayerControls() {
  if (videoElement) {
    videoElement.pause();
    videoElement.src = "";
    videoElement.removeAttribute("src");
  }
  if (progressSlider) progressSlider.value = 0;
  if (progressFill) progressFill.style.width = "0%";
  if (progressBuffer) progressBuffer.style.width = "0%";
  if (currentTimeDisplay) currentTimeDisplay.textContent = "0:00";
  if (durationDisplay) durationDisplay.textContent = "0:00";
  if (playerTitle) playerTitle.textContent = "";
  if (playerStatusText) playerStatusText.textContent = "In-App Stream • Free Public Domain Film";
  hidePlayerLoading();
  hidePlayerError();
  resetIdleTimer();

  if (modalVideoPlayer) modalVideoPlayer.src = "";
  if (fallbackPlayerWrapper) fallbackPlayerWrapper.classList.add("hidden");
}

function updatePlayPauseButton() {
  if (!videoElement || !playPauseBtn) return;
  const isPlaying = !videoElement.paused;
  const iconPlay = playPauseBtn.querySelector(".icon-play");
  const iconPause = playPauseBtn.querySelector(".icon-pause");

  if (isPlaying) {
    if (iconPlay) iconPlay.classList.add("hidden");
    if (iconPause) iconPause.classList.remove("hidden");
    playPauseBtn.setAttribute("aria-label", "Pause");
  } else {
    if (iconPlay) iconPlay.classList.remove("hidden");
    if (iconPause) iconPause.classList.add("hidden");
    playPauseBtn.setAttribute("aria-label", "Play");
  }
}

function updateVolumeIcon() {
  if (!muteBtn || !videoElement) return;
  const iconHigh = muteBtn.querySelector(".icon-volume-high");
  const iconLow = muteBtn.querySelector(".icon-volume-low");
  const iconMute = muteBtn.querySelector(".icon-mute");

  if (videoElement.muted || videoElement.volume === 0) {
    if (iconHigh) iconHigh.classList.add("hidden");
    if (iconLow) iconLow.classList.add("hidden");
    if (iconMute) iconMute.classList.remove("hidden");
    muteBtn.setAttribute("aria-label", "Unmute");
  } else if (videoElement.volume < 0.5) {
    if (iconHigh) iconHigh.classList.add("hidden");
    if (iconLow) iconLow.classList.remove("hidden");
    if (iconMute) iconMute.classList.add("hidden");
    muteBtn.setAttribute("aria-label", "Mute");
  } else {
    if (iconHigh) iconHigh.classList.remove("hidden");
    if (iconLow) iconLow.classList.add("hidden");
    if (iconMute) iconMute.classList.add("hidden");
    muteBtn.setAttribute("aria-label", "Mute");
  }
}

function resetIdleTimer() {
  if (customVideoPlayer) {
    customVideoPlayer.classList.remove("idle");
  }
  clearTimeout(playerIdleTimeout);
  playerIdleTimeout = setTimeout(() => {
    if (videoElement && !videoElement.paused && customVideoPlayer) {
      customVideoPlayer.classList.add("idle");
    }
  }, 3000);
}

function toggleFullscreen() {
  if (!customVideoPlayer) return;

  if (!document.fullscreenElement) {
    customVideoPlayer.requestFullscreen().catch(err => {
      console.error("Fullscreen error:", err);
    });
  } else {
    document.exitFullscreen();
  }
}

function updateFullscreenButton() {
  if (!fullscreenBtn) return;
  const iconFullscreen = fullscreenBtn.querySelector(".icon-fullscreen");
  const iconExitFullscreen = fullscreenBtn.querySelector(".icon-exit-fullscreen");

  if (document.fullscreenElement) {
    if (iconFullscreen) iconFullscreen.classList.add("hidden");
    if (iconExitFullscreen) iconExitFullscreen.classList.remove("hidden");
    fullscreenBtn.setAttribute("aria-label", "Exit fullscreen");
  } else {
    if (iconFullscreen) iconFullscreen.classList.remove("hidden");
    if (iconExitFullscreen) iconExitFullscreen.classList.add("hidden");
    fullscreenBtn.setAttribute("aria-label", "Fullscreen");
  }
}

function togglePictureInPicture() {
  if (!videoElement) return;

  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else if (document.pictureInPictureEnabled) {
    videoElement.requestPictureInPicture().catch(err => {
      console.error("PiP error:", err);
      showPlayerError("Picture-in-Picture is not available for this video");
    });
  } else {
    showPlayerError("Picture-in-Picture is not supported in this browser");
  }
}

function setPlaybackSpeed(speed) {
  if (!videoElement) return;
  currentPlaybackSpeed = speed;
  videoElement.playbackRate = speed;
  if (speedDisplay) speedDisplay.textContent = `${speed}x`;
}

function cyclePlaybackSpeed() {
  const speeds = [0.5, 1, 1.25, 1.5, 2];
  const currentIndex = speeds.indexOf(currentPlaybackSpeed);
  const nextIndex = (currentIndex + 1) % speeds.length;
  setPlaybackSpeed(speeds[nextIndex]);
}

function loadVideoIntoCustomPlayer(movie, videoUrl) {
  if (!videoElement || !customVideoPlayer) return;

  resetPlayerControls();
  currentVideoSource = videoUrl;

  if (playerTitle) playerTitle.textContent = movie.title || "";
  if (playerStatusText) playerStatusText.textContent = `Playing: ${movie.title || "Video"}`;

  showPlayerLoading();

  videoElement.src = videoUrl;
  videoElement.load();

  videoElement.addEventListener("loadedmetadata", () => {
    hidePlayerLoading();
    if (durationDisplay) durationDisplay.textContent = formatTime(videoElement.duration);
    if (progressSlider) {
      progressSlider.max = videoElement.duration;
      progressSlider.value = 0;
    }
  }, { once: true });

  videoElement.addEventListener("canplay", () => {
    hidePlayerLoading();
  }, { once: true });

  videoElement.addEventListener("error", () => {
    showPlayerError("Failed to load video. The source may be unavailable or unsupported.");
  }, { once: true });
}

function isDirectVideoUrl(url) {
  if (!url) return false;
  return /\.(mp4|webm|ogg|m4v)(\?.*)?$/i.test(url);
}

async function getDirectVideoUrlFromArchive(movie) {
  if (!movie || !isArchiveSource(movie)) return null;

  const identifier = getArchiveIdentifier(movie);
  if (!identifier) return null;

  // Try to fetch metadata to find actual MP4 files
  try {
    const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.files || !Array.isArray(data.files)) return null;

    // Find original MP4 files (prefer higher quality)
    const mp4Files = data.files.filter(file => {
      const name = (file.name || "").toLowerCase();
      const format = (file.format || "").toLowerCase();
      const isVideo = name.endsWith('.mp4') || name.endsWith('.m4v') || format.includes('mpeg4') || format.includes('h.264');
      const isOriginal = file.source === 'original';
      const isNotThumb = !name.includes('thumb') && !name.includes('sample');
      return isVideo && isOriginal && isNotThumb;
    });

    if (mp4Files.length === 0) return null;

    // Sort by file size (descending) to get best quality
    mp4Files.sort((a, b) => (b.size || 0) - (a.size || 0));

    const bestFile = mp4Files[0];
    return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(bestFile.name)}`;
  } catch (error) {
    console.error('Failed to fetch Archive metadata:', error);
    return null;
  }
}

function isYouTubeSource(url) {
  return /youtube\.com|youtu\.be/i.test(url || "");
}

function isArchiveSource(movie) {
  const haystack = `${movie.sourcePlatform || ""} ${movie.embedUrl || ""} ${movie.sourceUrl || ""}`;
  return /archive\.org|internet archive/i.test(haystack);
}

function getArchiveIdentifier(movie) {
  if (movie.sourceIdentifier) return movie.sourceIdentifier;
  const match = String(movie.embedUrl || movie.sourceUrl || "").match(
    /archive\.org\/(?:embed|details)\/([^/?#]+)/i
  );
  return match ? decodeURIComponent(match[1]) : "";
}

function collectArchiveQualities(files) {
  if (!Array.isArray(files)) return [];

  const originals = files.filter((file) => {
    const name = file.name || "";
    const format = (file.format || "").toLowerCase();
    const isVideo =
      /\.(mp4|m4v|mpeg4|mov)$/i.test(name) ||
      format.includes("mpeg4") ||
      format.includes("h.264");
    const isUnwanted =
      format.includes("ogv") ||
      format.includes("ogg") ||
      format.includes("thumb") ||
      format.includes("gif") ||
      /sample/i.test(name);
    return file.source === "original" && isVideo && !isUnwanted && Number(file.height) > 0;
  });

  const uniqueByHeight = new Map();
  originals.forEach((file) => {
    const height = Number(file.height);
    if (!uniqueByHeight.has(height)) {
      uniqueByHeight.set(height, file);
    }
  });

  return Array.from(uniqueByHeight.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([height, file]) => ({
      label: `${height}p`,
      filename: file.name
    }));
}

function showQualityNote(message) {
  if (modalQualityNote) modalQualityNote.textContent = message;
}

function setupPlayerQualityOptions(movie) {
  resetPlayerQualityUi();

  if (isYouTubeSource(movie.embedUrl)) {
    showQualityNote(
      "YouTube’s embedded player chooses playback quality automatically. A manual 480p/720p/1080p selector is not available for this official embed."
    );
    return;
  }

  if (!isArchiveSource(movie)) {
    showQualityNote(
      "Quality selection is not available for this authorized player. Use the player’s own controls if they appear."
    );
    return;
  }

  const identifier = getArchiveIdentifier(movie);
  if (!identifier) {
    showQualityNote(
      "This Internet Archive player manages quality automatically when multiple files exist. Use the player’s own quality/HD control if it appears."
    );
    return;
  }

  // Only show quality selector if using custom player or iframe
  if (customVideoPlayer && !customVideoPlayer.classList.contains("hidden")) {
    showQualityNote("Checking authorized Internet Archive files for additional playback qualities...");
    loadArchiveQualityOptions(movie, identifier);
  } else if (fallbackPlayerWrapper && !fallbackPlayerWrapper.classList.contains("hidden")) {
    showQualityNote("Checking authorized Internet Archive files for additional playback qualities...");
    loadArchiveQualityOptions(movie, identifier);
  } else {
    showQualityNote(
      "This Internet Archive player manages quality automatically when multiple files exist. Use the player's own quality/HD control if it appears."
    );
  }
}

async function loadArchiveQualityOptions(movie, identifier) {
  if (archiveMetadataController) {
    archiveMetadataController.abort();
  }
  const controller = new AbortController();
  archiveMetadataController = controller;

  try {
    const response = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      throw new Error("Archive metadata request failed");
    }

    const data = await response.json();
    if (activeModalMovie !== movie) return;

    const qualities = collectArchiveQualities(data.files);
    if (qualities.length >= 2) {
      modalQualitySelect.innerHTML = qualities
        .map(
          (quality) =>
            `<option value="${escapeHtml(quality.filename)}">${escapeHtml(quality.label)}</option>`
        )
        .join("");
      modalQualitySelect.classList.remove("hidden");
      if (modalQualityLabel) modalQualityLabel.classList.remove("hidden");
      showQualityNote(
        "These options use official Internet Archive files already attached to this verified copy."
      );

      modalQualitySelect.onchange = () => {
        const filename = modalQualitySelect.value;
        if (customVideoPlayer && !customVideoPlayer.classList.contains("hidden") && filename) {
          const newUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`;
          loadVideoIntoCustomPlayer(activeModalMovie, newUrl);
        } else if (fallbackPlayerWrapper && !fallbackPlayerWrapper.classList.contains("hidden") && modalVideoPlayer && filename) {
          modalVideoPlayer.src = `https://archive.org/embed/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`;
        }
      };
    } else {
      showQualityNote(
        "This Internet Archive copy does not expose multiple authorized playback qualities. The official player will choose the best available stream automatically. Use its own quality/HD control if it appears."
      );
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    if (activeModalMovie !== movie) return;
    showQualityNote(
      "This Internet Archive player manages quality automatically. A separate quality menu is shown only when multiple authorized files are available."
    );
  } finally {
    if (archiveMetadataController === controller) {
      archiveMetadataController = null;
    }
  }
}

function closeMobileNav() {
  if (navLinksList) navLinksList.classList.remove("open");
  if (navToggle) navToggle.setAttribute("aria-expanded", "false");
}

function setActiveNavLink(hash) {
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("active", href === hash);
  });
}

function scrollToSection(hash) {
  if (hash === "#home" || hash === "#") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setActiveNavLink("#home");
    return;
  }

  const target = document.querySelector(hash);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveNavLink(hash);
  }
}

/* Event listeners for Popular Movies Grid */
if (moviesGrid) {
  moviesGrid.addEventListener("click", (e) => {
    const watchBtn = e.target.closest(".watch-btn");
    const card = e.target.closest(".movie-card");

    if (watchBtn) {
      e.stopPropagation();
      const movieId = watchBtn.getAttribute("data-movie-id");
      const movie = findMovieById(movieId);
      if (movie) openWatchModal(movie);
    } else if (card) {
      const watchBtnInCard = card.querySelector(".watch-btn");
      if (watchBtnInCard) {
        const movieId = watchBtnInCard.getAttribute("data-movie-id");
        const movie = findMovieById(movieId);
        if (movie) openWatchModal(movie);
      }
    }
  });
}

/* Event listeners for Free & Legal Movies Grid */
if (freeMoviesGrid) {
  freeMoviesGrid.addEventListener("click", (e) => {
    const playBtn = e.target.closest(".play-now-btn") || e.target.closest(".watch-btn");
    const card = e.target.closest(".movie-card");

    if (playBtn) {
      e.stopPropagation();
      const movieId = playBtn.getAttribute("data-movie-id");
      const movie = findMovieById(movieId);
      if (movie) openWatchModal(movie);
    } else if (card) {
      const btn = card.querySelector(".play-now-btn") || card.querySelector(".watch-btn");
      if (btn) {
        const movieId = btn.getAttribute("data-movie-id");
        const movie = findMovieById(movieId);
        if (movie) openWatchModal(movie);
      }
    }
  });
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener("click", closeWatchModal);
}

if (watchModal) {
  watchModal.addEventListener("click", (e) => {
    if (e.target === watchModal) {
      closeWatchModal();
    }
  });
}

if (modalRetryBtn) {
  modalRetryBtn.addEventListener("click", () => {
    if (activeModalMovie) {
      loadWatchProviders(activeModalMovie.id);
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && watchModal && !watchModal.classList.contains("hidden")) {
    closeWatchModal();
  }
});

if (loadMoreFreeBtn) {
  loadMoreFreeBtn.addEventListener("click", () => {
    // Retry the failed page, otherwise request the next one.
    loadFreeMovies(freeMoviesPage + 1);
  });
}

/* Custom Video Player Event Listeners */
if (playPauseBtn && videoElement) {
  playPauseBtn.addEventListener("click", () => {
    if (videoElement.paused) {
      videoElement.play();
    } else {
      videoElement.pause();
    }
  });
}

if (rewindBtn && videoElement) {
  rewindBtn.addEventListener("click", () => {
    videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
  });
}

if (forwardBtn && videoElement) {
  forwardBtn.addEventListener("click", () => {
    videoElement.currentTime = Math.min(videoElement.duration, videoElement.currentTime + 10);
  });
}

if (muteBtn && videoElement) {
  muteBtn.addEventListener("click", () => {
    videoElement.muted = !videoElement.muted;
    updateVolumeIcon();
  });
}

if (volumeSlider && videoElement) {
  volumeSlider.addEventListener("input", () => {
    videoElement.volume = parseFloat(volumeSlider.value);
    videoElement.muted = false;
    updateVolumeIcon();
  });
}

if (progressSlider && videoElement) {
  progressSlider.addEventListener("input", () => {
    const time = parseFloat(progressSlider.value);
    videoElement.currentTime = time;
  });
}

if (videoElement) {
  videoElement.addEventListener("timeupdate", () => {
    if (progressSlider) progressSlider.value = videoElement.currentTime;
    if (progressFill) progressFill.style.width = `${(videoElement.currentTime / videoElement.duration) * 100}%`;
    if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(videoElement.currentTime);
  });

  videoElement.addEventListener("progress", () => {
    if (videoElement.buffered.length > 0) {
      const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
      if (progressBuffer) progressBuffer.style.width = `${(bufferedEnd / videoElement.duration) * 100}%`;
    }
  });

  videoElement.addEventListener("play", updatePlayPauseButton);
  videoElement.addEventListener("pause", updatePlayPauseButton);
  videoElement.addEventListener("volumechange", updateVolumeIcon);

  videoElement.addEventListener("loadedmetadata", () => {
    if (durationDisplay) durationDisplay.textContent = formatTime(videoElement.duration);
    if (progressSlider) progressSlider.max = videoElement.duration;
  });
}

if (speedBtn) {
  speedBtn.addEventListener("click", cyclePlaybackSpeed);
}

if (pipBtn) {
  pipBtn.addEventListener("click", togglePictureInPicture);
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", toggleFullscreen);
}

document.addEventListener("fullscreenchange", updateFullscreenButton);

if (customVideoPlayer) {
  customVideoPlayer.addEventListener("mousemove", resetIdleTimer);
  customVideoPlayer.addEventListener("click", resetIdleTimer);
  customVideoPlayer.addEventListener("touchstart", resetIdleTimer);
}

if (playerRetryBtn) {
  playerRetryBtn.addEventListener("click", () => {
    if (activeModalMovie && currentVideoSource) {
      loadVideoIntoCustomPlayer(activeModalMovie, currentVideoSource);
    }
  });
}

/* Keyboard shortcuts for video player */
document.addEventListener("keydown", (event) => {
  if (!watchModal || watchModal.classList.contains("hidden")) return;
  if (!videoElement || !customVideoPlayer || customVideoPlayer.classList.contains("hidden")) return;

  switch (event.key) {
    case " ":
    case "k":
      event.preventDefault();
      if (videoElement.paused) {
        videoElement.play();
      } else {
        videoElement.pause();
      }
      break;
    case "ArrowLeft":
      event.preventDefault();
      videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
      break;
    case "ArrowRight":
      event.preventDefault();
      videoElement.currentTime = Math.min(videoElement.duration, videoElement.currentTime + 10);
      break;
    case "ArrowUp":
      event.preventDefault();
      videoElement.volume = Math.min(1, videoElement.volume + 0.1);
      if (volumeSlider) volumeSlider.value = videoElement.volume;
      updateVolumeIcon();
      break;
    case "ArrowDown":
      event.preventDefault();
      videoElement.volume = Math.max(0, videoElement.volume - 0.1);
      if (volumeSlider) volumeSlider.value = videoElement.volume;
      updateVolumeIcon();
      break;
    case "m":
    case "M":
      event.preventDefault();
      videoElement.muted = !videoElement.muted;
      updateVolumeIcon();
      break;
    case "f":
    case "F":
      event.preventDefault();
      toggleFullscreen();
      break;
    case ">":
    case ".":
      event.preventDefault();
      cyclePlaybackSpeed();
      break;
  }
});

if (navToggle && navLinksList) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinksList.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "#home";
    event.preventDefault();
    closeMobileNav();

    if (href === "#home") {
      resetToPopularMovies();
      scrollToSection("#home");
      return;
    }

    if (href === "#free-movies" || href === "#popular") {
      if (isShowingSearchResults || isSearchQueryActive()) {
        resetToPopularMovies();
      }
      scrollToSection(href);
      return;
    }

    scrollToSection(href);
  });
});

// Load initial lists after helpers and event listeners are ready.
loadPopularMovies(1);
loadFreeMovies(1);




