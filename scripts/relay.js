window.addEventListener("message", (event) => {
  // Only accept messages from our own page, not from iframes or unknown sources
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "TWEET_HISTORY_EXT") return;

  if (event.data.type === "TWEET_DATA" && event.data.payload) {
    console.log(event.data.payload);
    // chrome.runtime
    //   .sendMessage({
    //     action: "SAVE_TWEET",
    //     tweet: event.data.payload,
    //   })
    //   .catch((err) => {
    //     // Service worker might be inactive – will wake up automatically on send
    //     console.warn("Relay sendMessage error:", err);
    //   });
  }
});
