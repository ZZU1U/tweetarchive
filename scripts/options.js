// Default settings
const DEFAULTS = {
  theme: "auto", // 'light', 'dark', 'auto'
  autoSave: true,
  maxTweetsPerPage: 20,
  saveSensitive: false,
  showStats: true,
  cursorEffects: true,
  saveSources: {
    homeTimeline: true,    // "For You" / "Following" timeline
    tweetDetail: true,     // replies / conversations
    userTweets: true,      // profile pages
    searchTimeline: true,  // search results
  },
};

/**
 * Load settings from sync storage, merging with defaults.
 */
async function loadSettings() {
  const stored = await browser.storage.sync.get(DEFAULTS);
  // Deep-merge saveSources since nested objects aren't auto-merged
  if (stored.saveSources && typeof stored.saveSources === "object") {
    stored.saveSources = { ...DEFAULTS.saveSources, ...stored.saveSources };
  } else {
    stored.saveSources = { ...DEFAULTS.saveSources };
  }
  return stored;
}

/**
 * Save a single setting.
 */
async function saveSetting(key, value) {
  await browser.storage.sync.set({ [key]: value });
}
