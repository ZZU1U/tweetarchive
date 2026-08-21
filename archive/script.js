// --- Configuration ---
let PAGE_SIZE = 20; // will be overridden by settings
const tweetTemplate = document.getElementById("tweetTemplate");
const tweetList = document.getElementById("tweetList");
const searchInput = document.getElementById("searchInput");
const sortAscBtn = document.getElementById("sortAsc");
const sortField = document.getElementById("sortField");
const engagementFilter = document.getElementById("engagementFilter");
const totalCountSpan = document.getElementById("totalCount");

const optionsBtn = document.getElementById("openOptions");
optionsBtn.onclick = () => {
  chrome.runtime.openOptionsPage();
};

const refreshBtn = document.getElementById("refreshBtn");
refreshBtn.onclick = () => {
  reloadFromScratch();
  fetchTotalCount();
};

const emptyState = document.getElementById("emptyState");

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
let activeEngagement = "all";
let ascending = false;
let sortBy = "viewedAt";
let isLoading = false; // prevent multiple concurrent loads
let mediaClickBehavior = "lightbox"; // lightbox | newTab | original

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
  const tweetUrl = `https://twitter.com/${tweet.user.username}/status/${tweet.tweetId}`;
  const profileUrl = `https://twitter.com/${tweet.user.username}`;

  const avatarLink = clone.querySelector(".avatar-link");
  avatarLink.href = profileUrl;
  clone.querySelector(".tweet-avatar").src = tweet.user.profile_image_url;

  const userLink = clone.querySelector(".user-link");
  userLink.href = profileUrl;

  // Tweet links (posted time + tweet text) point to the tweet itself
  clone.querySelectorAll(".tweet-link").forEach((link) => {
    link.href = tweetUrl;
  });

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
    const tweetUrlForMedia = `https://twitter.com/${tweet.user.username}/status/${tweet.tweetId}`;
    tweet.tweetMedia.forEach((url, index) => {
      grid.appendChild(buildMediaItem(url, index));
    });
    // Stash the media array + tweet URL on the grid for lightbox navigation
    grid.__media = tweet.tweetMedia;
    grid.__tweetUrl = tweetUrlForMedia;
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
  stats.querySelector(".stat-bookmarks").textContent = formatCount(
    tweet.tweetStats.bookmarks,
  );
  stats.querySelector(".stat-views").textContent = formatCount(
    tweet.tweetStats.views,
  );

  // Self-engagement state: colour the icon only when *I* engaged
  if (tweet.isFavorite) stats.querySelector(".stat-like").classList.add("self");
  if (tweet.isRetweeted) stats.querySelector(".stat-rt").classList.add("self");
  if (tweet.isBookmarked) stats.querySelector(".stat-bookmark").classList.add("self");

  return clone;
}

/**
 * Build one clickable media item based on the user's media-click setting:
 *  - lightbox: opens the in-page preview with per-post navigation
 *  - newTab:   opens the image URL in a new tab
 *  - original: opens the original tweet on X
 */
function buildMediaItem(url, index) {
  const img = document.createElement("img");
  img.src = url;
  img.loading = "lazy";
  img.alt = "";

  const item = document.createElement(
    mediaClickBehavior === "lightbox" ? "button" : "a",
  );
  item.className = "media-item";

  if (mediaClickBehavior === "lightbox") {
    item.type = "button";
    item.title = "Preview";
    item.dataset.index = String(index);
    item.addEventListener("click", () => {
      const grid = item.closest(".media-grid");
      openLightbox(grid.__media || [url], index);
    });
  } else if (mediaClickBehavior === "newTab") {
    item.href = url;
    item.target = "_blank";
    item.rel = "noopener noreferrer";
    item.title = "Open image in new tab";
  } else {
    item.href = "#";
    item.target = "_blank";
    item.rel = "noopener noreferrer";
    item.title = "Open original post";
    item.addEventListener("click", (e) => {
      const grid = item.closest(".media-grid");
      if (grid.__tweetUrl) {
        e.preventDefault();
        chrome.tabs.create({ url: grid.__tweetUrl });
      }
    });
  }

  item.appendChild(img);
  return item;
}

/* ============================================================
   MEDIA LIGHTBOX — in-page preview, navigation within post
   ============================================================ */
let lbMedia = [];
let lbIndex = 0;

const lightbox = document.getElementById("lightbox");
const lbImage = document.getElementById("lbImage");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");

function openLightbox(media, startIndex) {
  lbMedia = media || [];
  lbIndex = Math.min(Math.max(startIndex || 0, 0), Math.max(lbMedia.length - 1, 0));
  updateLightbox();
  lightbox.classList.add("open");
  document.body.classList.add("lb-open");
}

function updateLightbox() {
  lbImage.src = lbMedia[lbIndex] || "";
  lbPrev.classList.toggle("disabled", lbMedia.length < 2);
  lbNext.classList.toggle("disabled", lbMedia.length < 2);
}

function closeLightbox() {
  lightbox.classList.remove("open");
  document.body.classList.remove("lb-open");
  lbImage.src = "";
}

lbClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox(); // click on the tinted backdrop
});
lbPrev.addEventListener("click", (e) => {
  e.stopPropagation();
  if (lbMedia.length < 2) return;
  lbIndex = (lbIndex - 1 + lbMedia.length) % lbMedia.length;
  updateLightbox();
});
lbNext.addEventListener("click", (e) => {
  e.stopPropagation();
  if (lbMedia.length < 2) return;
  lbIndex = (lbIndex + 1) % lbMedia.length;
  updateLightbox();
});
document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") lbPrev.click();
  else if (e.key === "ArrowRight") lbNext.click();
});

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

  // Engagement filter (liked / retweeted / bookmarked)
  if (activeEngagement === "liked") {
    result = result.filter((t) => t.isFavorite);
  } else if (activeEngagement === "retweeted") {
    result = result.filter((t) => t.isRetweeted);
  } else if (activeEngagement === "bookmarked") {
    result = result.filter((t) => t.isBookmarked);
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
      pageSize: PAGE_SIZE,
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
      pageSize: PAGE_SIZE,
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
  // toggle empty state
  emptyState.classList.toggle("hidden", filtered.length > 0);
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

engagementFilter.addEventListener("change", (e) => {
  activeEngagement = e.target.value;
  renderAll(); // client-side re-filter of loaded tweets
});

// --- Theme ---
function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (theme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    // auto: use system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
}

// Listen for system theme changes (for "auto" mode)
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  chrome.storage.sync.get({ theme: "auto" }).then((stored) => {
    if (stored.theme === "auto") applyTheme("auto");
  });
});

// --- Load settings ---
async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get({
      maxTweetsPerPage: 20,
      theme: "auto",
      mediaClick: "lightbox",
    });
    PAGE_SIZE = stored.maxTweetsPerPage || 20;
    mediaClickBehavior = stored.mediaClick || "lightbox";
    applyTheme(stored.theme);
  } catch (e) {
    console.warn("Failed to load settings, using defaults", e);
  }
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.maxTweetsPerPage) {
    PAGE_SIZE = changes.maxTweetsPerPage.newValue || 20;
  }
  if (changes.theme) {
    applyTheme(changes.theme.newValue);
  }
  if (changes.mediaClick) {
    mediaClickBehavior = changes.mediaClick.newValue || "lightbox";
  }
});

// --- Initial load ---
async function init() {
  await loadSettings();
  await fetchTotalCount();
  setupInfiniteScroll();
  await loadFirstPage();
}

init();
