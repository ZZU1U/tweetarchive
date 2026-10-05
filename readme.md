![TweetArchive banner](./images/banner.png)

# TweetArchive

A Browser extension that automatically archives tweets as they appear on your timeline. Every tweet you see on X/Twitter is saved locally to your browser — search, filter, and browse your personal history whenever you want. Never lose a tweet you've seen again.

The archive UI is inspired by the Blue Archive game aesthetic.

Should be available on [firefox store](https://addons.mozilla.org/en-US/firefox/addon/tweetarchive) *if it has passed the review already*.

---

## Features

- **Automatic saving** — Tweets are captured in real time from X's GraphQL API responses (no DOM scraping, no page parsing). Anything you scroll past gets stored.
- **Engagement tracking** — Likes, retweets, and bookmarks are tracked as you interact. Your liked/retweeted/bookmarked tweets are color-coded in the archive, and you can filter to show only them.
- **Search & filter** — Full-text search, plus filters for media, quotes, verified users, and your own engagement.
- **Media preserved** — Images from tweets (and quoted tweets) are saved, with lightbox preview or open-in-new-tab options.
- **Sort & paginate** — Sort by viewed or posted time, either direction; configurable tweets-per-page.
- **Themes** — Light, Dark, or Auto (follows system preference).
- **Local-first storage** — Everything lives in your browser's IndexedDB. No accounts, no servers, no tracking: your archive never leaves your machine.
- **Cursor effects** — Blue Archive–style tap ripple and sparkle trail (toggleable, respects `prefers-reduced-motion`).

---

## Installation

TweetArchive is distributed as a zip file from the [Releases](https://github.com/zzu1u/tweetarchive/releases) page.

1. Download the latest `tweetarchive.zip`
2. Unzip it somewhere on your computer (keep the folder — it must stay in place)
3. Open `chrome://extensions` in Chrome (works the same in Edge, Brave, or Opera)
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the unzipped folder

The extension icon should appear in your toolbar.

> Only load the extension from zips you trust.

---

## Getting started

1. Browse X/Twitter as usual — tweets on your timeline, conversations, profile pages, and search results are archived automatically (the saved sources are configurable in settings).
2. Click the TweetArchive icon in your toolbar to open your archive.
3. Search the archive by text, filter by type (media, quotes, verified) or by your own engagement (liked, retweeted, bookmarked), and sort however you like.
4. Open the settings page via the gear icon in the archive header (or right-click the extension icon → Options).

---

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Theme | Light, Dark, or Auto (system preference) | Auto |
| Save from: Home timeline | For You / Following feed | On |
| Save from: Replies & conversations | Tweet detail / reply threads | On |
| Save from: Profile pages | User tweet timelines | On |
| Save from: Search results | Search timeline | On |
| Tweets per page | Number of tweets loaded per pagination request | 20 |
| Media click | Preview in lightbox, open image in new tab, or open original post | Lightbox |
| Cursor effects | Blue Archive tap ripple & sparkle trail | On |

---

## How it works

- **Interception** — A content script running in the page's main world intercepts X's GraphQL API responses (`fetch` and XHR). Timeline, profile, conversation, and action endpoints are all captured.
- **Storage** — Extracted tweet data is relayed to the background service worker, which stores it in IndexedDB keyed by tweet ID.
- **Live updates** — When you like, retweet, or bookmark a tweet that's already archived, the stored record is updated in place — including the tweet's stats.
- **Effects** — A small canvas overlay draws the tap ripple and cursor trail on the archive and settings pages; it's `pointer-events: none`, pauses when the tab is hidden, and is fully disabled with `prefers-reduced-motion`.

---

## Privacy

All archived data is stored locally in your browser's IndexedDB. TweetArchive has no servers, sends nothing anywhere, and requires no account. Uninstalling the extension or clearing your browser data will delete your archive.

---

## Development

No build tools, no npm, no bundler — pure vanilla JavaScript.

1. Clone the repo
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked** and select the `tweetarchive` folder

### Project structure

```
tweetarchive/
├── manifest.json          # Extension manifest (MV3)
├── scripts/
│   ├── background.js      # Service worker: IndexedDB, message routing
│   ├── readfeed.js        # MAIN world: intercepts X GraphQL API responses
│   ├── relay.js           # ISOLATED world: bridges MAIN world ↔ background
│   ├── effects.js         # Canvas cursor effects (archive & options pages)
│   └── options.js         # Default settings + load/save helpers
├── options/               # Settings page (theme, sources, pagination)
├── archive/               # Archive viewer (search, filter, lightbox)
├── images/                # Icons and banner
└── fonts/                 # UI fonts
```

### Key technical details

- IndexedDB stores tweets keyed by `tweetId`, with `byPostedAt` and `byViewedAt` indexes.
- Pagination is cursor-based — the archive sends the last sort value + tweet ID as the cursor for the next page.
- Settings are shared between the isolated and main worlds via `CustomEvent` relay on `window`.
- Theming is done by toggling a `.dark` class on `<html>`; the archive and options pages share the same CSS variable scheme.

---

## License

MIT — see [LICENSE](LICENSE).
