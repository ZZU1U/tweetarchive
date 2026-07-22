// DOM Elements
const tweetGrid = document.getElementById("tweetGrid");
const searchInput = document.getElementById("searchInput");
const sortBy = document.getElementById("sortBy");
const filterBy = document.getElementById("filterBy");
const totalCount = document.getElementById("totalCount");
const clearAllBtn = document.getElementById("clearAll");

// Get all tweets from database
async function getAllTweets() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getAllTweets" }, (response) => {
      if (!response) {
        reject();
      } else if (response?.error) {
        reject(response.error);
      } else {
        resolve(response.result);
      }
    });
  });
}

// Delete all tweets
async function clearAllTweets() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "clearAllTweets" }, (response) => {
      if (!response) {
        reject();
      } else if (response?.error) {
        reject(response.error);
      } else {
        resolve();
      }
    });
  });
}

// Filter and sort tweets
function processTweets(tweets) {
  let filtered = [...tweets];

  // Search filter
  const searchTerm = searchInput.value.toLowerCase().trim();
  if (searchTerm) {
    filtered = filtered.filter(
      (t) =>
        t.tweetText?.toLowerCase().includes(searchTerm) ||
        t.userName?.toLowerCase().includes(searchTerm) ||
        t.userHandle?.toLowerCase().includes(searchTerm),
    );
  }

  // Image filter
  const filterType = filterBy.value;
  if (filterType === "images") {
    filtered = filtered.filter(
      (t) => t.tweetImagesAndVideos && t.tweetImagesAndVideos.length > 0,
    );
  } else if (filterType === "text") {
    filtered = filtered.filter(
      (t) => !t.tweetImagesAndVideos || t.tweetImagesAndVideos.length === 0,
    );
  }

  // Sort
  const sortType = sortBy.value;
  filtered.sort((a, b) => {
    if (sortType === "newest") {
      return new Date(b.tweetTime) - new Date(a.tweetTime);
    } else if (sortType === "oldest") {
      return new Date(a.tweetTime) - new Date(b.tweetTime);
    } else if (sortType === "recentlySeen") {
      return new Date(b.seenTime) - new Date(a.seenTime);
    }
    return 0;
  });

  return filtered;
}

// Render tweets to the grid
function renderTweets() {
  getAllTweets()
    .then((allTweets) => {
      const filtered = processTweets(allTweets);

      // Update stats
      totalCount.textContent = allTweets.length;

      if (filtered.length === 0) {
        tweetGrid.innerHTML = `
        <div class="empty-state">
          <h2>No tweets found</h2>
          <p>${allTweets.length === 0 ? "Start scrolling on X to build your archive!" : "Try adjusting your search or filters."}</p>
        </div>
      `;
        return;
      }

      // Build HTML
      tweetGrid.innerHTML = filtered
        .map(
          (tweet) => `
      <div class="tweet-card">
        <div class="tweet-header">
          ${tweet.userPfp ? `<img class="tweet-avatar" src="${tweet.userPfp}" alt="${tweet.userName}" />` : ""}
          <div class="tweet-user">
            <span class="tweet-name">${escapeHtml(tweet.userName)}</span>
            <span class="tweet-handle">${escapeHtml(tweet.userHandle)}</span>
          </div>
          <span class="tweet-time">${formatTime(tweet.tweetTime)}</span>
        </div>

        <div class="tweet-text">${escapeHtml(tweet.tweetText || "")}</div>

        ${
          tweet.tweetImagesAndVideos && tweet.tweetImagesAndVideos.length > 0
            ? `
          <div class="tweet-images">
            ${tweet.tweetImagesAndVideos
              .map(
                (img) =>
                  `<img src="${img.src}" alt="${img.alt || "Tweet image"}" loading="lazy" />`,
              )
              .join("")}
          </div>
        `
            : ""
        }

        <div class="tweet-footer">
          <span>Archived: ${formatTime(tweet.seenTime)}</span>
          <span class="tweet-id">ID: ${tweet.tweetId}</span>
        </div>
      </div>
    `,
        )
        .join("");
    })
    .catch((err) => {
      console.error("Failed to render tweets:", err);
      tweetGrid.innerHTML = `<div class="empty-state"><h2>Error loading archive</h2><p>${err.message}</p></div>`;
    });
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Utility: Format time
function formatTime(timestamp) {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 🎯 Debounce search input
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

// Event Listeners
searchInput.addEventListener("input", debounce(renderTweets, 300));
sortBy.addEventListener("change", renderTweets);
filterBy.addEventListener("change", renderTweets);
clearAllBtn.addEventListener("click", clearAllTweets);

// Initial render
renderTweets();
