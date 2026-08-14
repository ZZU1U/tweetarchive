// Relay settings from chrome.storage to the MAIN world
async function relaySettings() {
  const stored = await chrome.storage.sync.get({
    saveSources: {
      homeTimeline: true,
      tweetDetail: true,
      userTweets: true,
      searchTimeline: true,
    },
  });

  window.dispatchEvent(
    new CustomEvent("TWEET_ARCHIVE_SETTINGS", {
      detail: { saveSources: stored.saveSources },
    }),
  );
}

// Relay settings on load
relaySettings();

// Listen for settings changes from options page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.saveSources) {
    window.dispatchEvent(
      new CustomEvent("TWEET_ARCHIVE_SETTINGS", {
        detail: { saveSources: changes.saveSources.newValue },
      }),
    );
  }
});

// Forward tweet data from MAIN world to background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "TWEET_ARCHIVE") return;

  if (event.data.type === "TWEET_DATA" && event.data.payload) {
    try {
      chrome.runtime.sendMessage({
        action: "readTweet",
        tweet: event.data.payload,
      });
    } catch (err) {
      console.warn("Relay sendMessage error:", err);
    }
  }
});