always use delegate wave

# Project context for AI agents

Chrome extension (MV3). Two content scripts on twitter.com/x.com:
- `scripts/readfeed.js` — MAIN world, intercepts GraphQL API calls
- `scripts/relay.js` — ISOLATED world, bridges MAIN ↔ background

Data stored in IndexedDB (`tweetarchive` DB). Background service worker handles all DB ops.

Settings live in `chrome.storage.sync` — see `options/script.js` for the full schema.

Key gotcha: `originalFetch = window.fetch.bind(window)` must be defined in `readfeed.js` before patching fetch (it's easy to forget).