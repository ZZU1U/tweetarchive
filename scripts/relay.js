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
