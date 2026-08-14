// Default settings (mirrors scripts/options.js)
const DEFAULTS = {
  theme: "auto",
  autoSave: true,
  maxTweetsPerPage: 20,
  saveSensitive: false,
  showStats: true,
  saveSources: {
    homeTimeline: true,
    tweetDetail: true,
    userTweets: true,
    searchTimeline: true,
  },
};

// --- DOM refs ---
const themeRadios = document.querySelectorAll('input[name="theme"]');
const sourceHomeTimeline = document.getElementById("sourceHomeTimeline");
const sourceTweetDetail = document.getElementById("sourceTweetDetail");
const sourceUserTweets = document.getElementById("sourceUserTweets");
const sourceSearchTimeline = document.getElementById("sourceSearchTimeline");
const maxTweetsPerPage = document.getElementById("maxTweetsPerPage");
const statusEl = document.getElementById("status");

// --- Theme for the options page itself ---
function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (theme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    if (prefersDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
}

// Listen for system theme changes (for "auto" mode)
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    chrome.storage.sync.get({ theme: "auto" }).then((stored) => {
      if (stored.theme === "auto") applyTheme("auto");
    });
  });

// --- Show status toast ---
let statusTimeout;
function showStatus(message) {
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusEl.classList.add("hidden");
  }, 2000);
}

// --- Load settings and populate form ---
async function loadAndRender() {
  const stored = await chrome.storage.sync.get(DEFAULTS);

  // Deep-merge saveSources
  const saveSources = {
    ...DEFAULTS.saveSources,
    ...(stored.saveSources || {}),
  };

  // Theme
  applyTheme(stored.theme);
  const checkedRadio = document.querySelector(
    `input[name="theme"][value="${stored.theme}"]`,
  );
  if (checkedRadio) checkedRadio.checked = true;

  // Sources
  sourceHomeTimeline.checked = saveSources.homeTimeline;
  sourceTweetDetail.checked = saveSources.tweetDetail;
  sourceUserTweets.checked = saveSources.userTweets;
  sourceSearchTimeline.checked = saveSources.searchTimeline;

  // Pagination
  maxTweetsPerPage.value = stored.maxTweetsPerPage;
}

// --- Save settings ---
async function saveAll() {
  const theme = document.querySelector('input[name="theme"]:checked')?.value || "auto";
  const saveSources = {
    homeTimeline: sourceHomeTimeline.checked,
    tweetDetail: sourceTweetDetail.checked,
    userTweets: sourceUserTweets.checked,
    searchTimeline: sourceSearchTimeline.checked,
  };
  const pagination = parseInt(maxTweetsPerPage.value, 10) || 20;

  await chrome.storage.sync.set({
    theme,
    saveSources,
    maxTweetsPerPage: pagination,
  });

  applyTheme(theme);
  showStatus("Settings saved");
}

// --- Auto-save on any change ---
function bindAutoSave() {
  // Theme radios
  themeRadios.forEach((radio) => {
    radio.addEventListener("change", saveAll);
  });

  // Source checkboxes
  [sourceHomeTimeline, sourceTweetDetail, sourceUserTweets, sourceSearchTimeline].forEach(
    (cb) => {
      cb.addEventListener("change", saveAll);
    },
  );

  // Pagination debounced (save after typing stops)
  let paginationTimeout;
  maxTweetsPerPage.addEventListener("input", () => {
    clearTimeout(paginationTimeout);
    paginationTimeout = setTimeout(saveAll, 500);
  });

  // Also save on blur (immediate)
  maxTweetsPerPage.addEventListener("blur", () => {
    clearTimeout(paginationTimeout);
    saveAll();
  });
}

// --- Init ---
async function init() {
  await loadAndRender();
  bindAutoSave();
}

init();