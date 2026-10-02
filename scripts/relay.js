// Relay settings from browser.storage to the MAIN world
async function relaySettings() {
  const stored = await browser.storage.sync.get({
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
browser.storage.onChanged.addListener((changes, area) => {
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
      browser.runtime.sendMessage({
        action: "readTweet",
        tweet: event.data.payload,
      });
    } catch (err) {
      console.warn("Relay sendMessage error:", err);
    }
  }

  if (event.data.type === "TWEET_STATE_UPDATE" && event.data.payload) {
    try {
      browser.runtime.sendMessage({
        action: "updateTweetState",
        tweetId: event.data.payload.tweetId,
        isFavorite: event.data.payload.isFavorite,
        isBookmarked: event.data.payload.isBookmarked,
        isRetweeted: event.data.payload.isRetweeted,
        tweetStats: event.data.payload.tweetStats,
      });
    } catch (err) {
      console.warn("Relay sendMessage error:", err);
    }
  }
});
