// --- Configuration ---
const PAGE_SIZE = 20;
const tweetTemplate = document.getElementById("tweetTemplate");
const tweetList = document.getElementById("tweetList");
const searchInput = document.getElementById("searchInput");
const sortAscBtn = document.getElementById("sortAsc");
const sortField = document.getElementById("sortField");
const totalCountSpan = document.getElementById("totalCount");

// Filter buttons
const filterAll = document.getElementById("filterAll");
const filterMedia = document.getElementById("filterMedia");
const filterQuote = document.getElementById("filterQuote");
const filterVerified = document.getElementById("filterVerified");

// --- State ---
let allTweets = []; // currently loaded tweets
let currentCursor = null; // { lastSortValue, lastTweetId } or null
let hasMore = true; // assume true until we get an empty page
let activeFilter = "all";
let ascending = false;
let sortBy = "viewedAt";
let isLoading = false; // prevent multiple concurrent loads

// --- Helpers (formatRelativeTime, formatPostedTime, formatCount unchanged) ---
// (keep your existing formatRelativeTime and formatPostedTime functions)

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

/**
 * Relative time for "viewed at" (always relative)
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return "";

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "less than a minute ago";
  if (minutes === 1) return "about a minute ago";
  if (minutes < 60) return `about ${minutes} minutes ago`;
  if (hours === 1) return "about an hour ago";
  if (hours < 24) return `about ${hours} hours ago`;
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (months === 1) return "about a month ago";
  if (months < 12) return `${months} months ago`;
  if (years === 1) return "about a year ago";
  return `${years} years ago`;
}

/**
 * Posted time: relative for recent, absolute for older (like Twitter)
 */
function formatPostedTime(timestamp) {
  if (!timestamp) return "";

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  // If less than 3 days old, use relative
  if (days < 1) return formatRelativeTime(timestamp);
  if (days === 1) return "yesterday";
  if (days <= 3) return `${days} days ago`;

  // Otherwise show absolute date (e.g. "Jul 24, 2026")
  const d = new Date(then);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

// --- Fetch total count from DB ---
async function fetchTotalCount() {
  try {
    const res = await chrome.runtime.sendMessage({ action: "getTweetCount" });
    if (res && res.count !== undefined) {
      totalCountSpan.textContent = res.count;
    }
  } catch (e) {
    console.error("Failed to get tweet count", e);
  }
}

// --- Render functions (unchanged except date formatters) ---
function renderTweet(tweet) {
  const clone = tweetTemplate.content.cloneNode(true);

  // Avatar & links
  const avatarLink = clone.querySelector(".avatar-link");
  avatarLink.href = `https://twitter.com/${tweet.user.username}`;
  clone.querySelector(".tweet-avatar").src = tweet.user.profile_image_url;

  const userLink = clone.querySelector(".user-link");
  userLink.href = `https://twitter.com/${tweet.user.username}`;

  clone.querySelector(".user-name").textContent = tweet.user.name;
  clone.querySelector(".user-handle").textContent = `@${tweet.user.username}`;

  if (tweet.user.isVerified) {
    clone.querySelector(".verified-badge").classList.remove("hidden");
  }
  if (tweet.user.isParody) {
    clone.querySelector(".parody-badge").classList.remove("hidden");
    clone.querySelector(".parody-badge").textContent = "P";
  }

  // --- Use the new relative / posted formatters ---
  clone.querySelector(".posted-time").textContent = formatPostedTime(
    tweet.postedAt,
  );
  clone.querySelector(".viewed-time").textContent =
    `Viewed ${formatRelativeTime(tweet.viewedAt)}`;

  if (tweet.isQuote) {
    clone.querySelector(".quote-badge").classList.remove("hidden");
  }

  clone.querySelector(".tweet-text").textContent = tweet.tweetText || "";

  if (tweet.tweetMedia && tweet.tweetMedia.length) {
    const grid = clone.querySelector(".media-grid");
    grid.classList.remove("hidden");
    if (tweet.tweetMedia.length === 1) grid.classList.add("single");
    tweet.tweetMedia.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.loading = "lazy";
      grid.appendChild(img);
    });
  }

  if (tweet.isSensitive) {
    clone.querySelector(".sensitive-overlay").classList.remove("hidden");
  }

  const stats = clone.querySelector(".tweet-stats");
  stats.querySelector(".stat-replies").textContent = formatCount(
    tweet.tweetStats.replies,
  );
  stats.querySelector(".stat-retweets").textContent = formatCount(
    tweet.tweetStats.retweets,
  );
  stats.querySelector(".stat-likes").textContent = formatCount(
    tweet.tweetStats.favorites,
  );
  stats.querySelector(".stat-views").textContent = formatCount(
    tweet.tweetStats.views,
  );

  return clone;
}

// Filter local data (no sorting, already sorted by DB)
function applyFilters(tweets) {
  let result = [...tweets];
  const query = searchInput.value.toLowerCase().trim();
  if (query) {
    result = result.filter((t) => t.tweetText.toLowerCase().includes(query));
  }
  if (activeFilter === "media") {
    result = result.filter((t) => t.tweetMedia && t.tweetMedia.length > 0);
  } else if (activeFilter === "quote") {
    result = result.filter((t) => t.isQuote);
  } else if (activeFilter === "verified") {
    result = result.filter((t) => t.user.isVerified);
  }
  return result;
}

function renderAll() {
  tweetList.innerHTML = "";
  const filtered = applyFilters(allTweets);
  filtered.forEach((tweet) => tweetList.appendChild(renderTweet(tweet)));
}

// --- Pagination calls (modified) ---
async function loadFirstPage() {
  isLoading = true;
  try {
    const res = await chrome.runtime.sendMessage({
      action: "getTweetsPage",
      sortField: sortBy,
      ascending: ascending,
    });
    allTweets = res.items || [];
    currentCursor = res.nextCursor || null;
    hasMore = Boolean(res.nextCursor);
    renderAll();
  } catch (e) {
    console.error("Failed to load tweets", e);
  } finally {
    isLoading = false;
  }
}

async function loadNextPage() {
  if (!hasMore || isLoading) return;
  isLoading = true;
  try {
    const res = await chrome.runtime.sendMessage({
      action: "getTweetsPage",
      cursor: currentCursor,
      sortField: sortBy,
      ascending: ascending,
    });
    if (res.items && res.items.length) {
      allTweets = allTweets.concat(res.items);
      currentCursor = res.nextCursor || null;
      hasMore = Boolean(res.nextCursor);
      renderAll(); // re-render everything (simple approach; for performance you could append only new ones)
    } else {
      hasMore = false;
    }
  } catch (e) {
    console.error("Failed to load more", e);
  } finally {
    isLoading = false;
  }
}

// --- Infinite scroll with IntersectionObserver ---
let sentinelEl = null;
function setupInfiniteScroll() {
  // Remove old sentinel if any
  if (sentinelEl) sentinelEl.remove();
  // Create a tiny element at the very bottom
  sentinelEl = document.createElement("div");
  sentinelEl.id = "scroll-sentinel";
  tweetList.appendChild(sentinelEl);

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        loadNextPage();
      }
    },
    { rootMargin: "200px" },
  ); // trigger a bit before reaching the bottom

  observer.observe(sentinelEl);
}

// Call after rendering to re-attach sentinel
function refreshInfiniteScroll() {
  // Always put a sentinel after the last tweet in the DOM
  if (sentinelEl) {
    // Re-append it to be the last child
    tweetList.appendChild(sentinelEl);
  }
}

// Override renderAll to always include the sentinel
function renderAll() {
  tweetList.innerHTML = "";
  const filtered = applyFilters(allTweets);
  filtered.forEach((tweet) => tweetList.appendChild(renderTweet(tweet)));
  // ensure sentinel is at the end
  refreshInfiniteScroll();
}

// --- Filter / sort change – reload from scratch ---
async function reloadFromScratch() {
  currentCursor = null;
  allTweets = [];
  hasMore = true;
  await loadFirstPage();
  fetchTotalCount(); // also update total count
}

// --- Event listeners (updated) ---
filterAll.addEventListener("click", () => {
  activeFilter = "all";
  updateFilterButtons();
  renderAll(); // just re-filter loaded data (no reload)
});
filterMedia.addEventListener("click", () => {
  activeFilter = "media";
  updateFilterButtons();
  renderAll();
});
filterQuote.addEventListener("click", () => {
  activeFilter = "quote";
  updateFilterButtons();
  renderAll();
});
filterVerified.addEventListener("click", () => {
  activeFilter = "verified";
  updateFilterButtons();
  renderAll();
});

function updateFilterButtons() {
  [filterAll, filterMedia, filterQuote, filterVerified].forEach((b) =>
    b.classList.remove("active"),
  );
  if (activeFilter === "all") filterAll.classList.add("active");
  else if (activeFilter === "media") filterMedia.classList.add("active");
  else if (activeFilter === "quote") filterQuote.classList.add("active");
  else if (activeFilter === "verified") filterVerified.classList.add("active");
}

searchInput.addEventListener("input", renderAll); // only filters, doesn't reload

sortAscBtn.addEventListener("click", () => {
  ascending = !ascending;
  sortAscBtn.textContent = ascending ? "Ascending" : "Descending";
  reloadFromScratch();
});

sortField.addEventListener("change", (e) => {
  sortBy = e.target.value;
  reloadFromScratch();
});

// --- Initial load ---
async function init() {
  await fetchTotalCount();
  setupInfiniteScroll();
  await loadFirstPage();
}

init();
