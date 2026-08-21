// IndexedDB INTERACTIONS

const DB_NAME = "tweetarchive";
const DB_VERSION = 1;
const TWEET_STORE_NAME = "seentweets";
const USER_STORE_NAME = "seenusers";

let dbPromise = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(TWEET_STORE_NAME)) {
          const objectStore = db.createObjectStore(TWEET_STORE_NAME, {
            keyPath: "tweetId",
          });
          objectStore.createIndex("byPostedAt", "postedAt");
          objectStore.createIndex("byViewedAt", "viewedAt");
        }

        if (!db.objectStoreNames.contains(USER_STORE_NAME)) {
          const objectStore = db.createObjectStore(USER_STORE_NAME, {
            keyPath: "userId",
          });
          objectStore.createIndex("byFollowers", "followers");
          objectStore.createIndex("byName", "name");
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        console.error("Database error:", event.target.error);
        reject(event.target.error);
      };
    });
  }
  return dbPromise;
}

async function addUser(user) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USER_STORE_NAME], "readwrite");
    const store = transaction.objectStore(USER_STORE_NAME);

    // using put is better than add because it updates item if it exists
    const request = store.put(user);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function addTweet(tweet) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TWEET_STORE_NAME], "readwrite");
    const store = transaction.objectStore(TWEET_STORE_NAME);

    const entry = {
      ...tweet,
      viewedAt:
        tweet.viewedAt instanceof Date
          ? tweet.viewedAt.getTime()
          : tweet.viewedAt,
      postedAt:
        tweet.postedAt instanceof Date
          ? tweet.postedAt.getTime()
          : tweet.postedAt,
    };

    // using put is better than add because it updates item if it exists
    const request = store.put(entry);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getAllTweets() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TWEET_STORE_NAME], "readwrite");
    const store = transaction.objectStore(TWEET_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getAllUsers() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USER_STORE_NAME], "readwrite");
    const store = transaction.objectStore(USER_STORE_NAME);

    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function clearTweets() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TWEET_STORE_NAME], "readwrite");
    const store = transaction.objectStore(TWEET_STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function clearUsers() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USER_STORE_NAME], "readwrite");
    const store = transaction.objectStore(USER_STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getUserInfo(id) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USER_STORE_NAME], "readwrite");
    const store = transaction.objectStore(USER_STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getTweet(tweetId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TWEET_STORE_NAME], "readonly");
    const store = transaction.objectStore(TWEET_STORE_NAME);
    const request = store.get(tweetId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function getTweetsPage({
  cursor,
  sortField = "viewedAt",
  ascending = false,
  pageSize = 20,
} = {}) {
  const db = await getDB();
  const transaction = db.transaction([TWEET_STORE_NAME], "readonly");
  const store = transaction.objectStore(TWEET_STORE_NAME);
  const index = store.index(
    sortField === "postedAt" ? "byPostedAt" : "byViewedAt",
  );

  const direction = ascending ? "next" : "prev";
  let range = null;

  if (cursor) {
    if (ascending) {
      // include all items with sort value >= lastSortValue
      range = IDBKeyRange.lowerBound(cursor.lastSortValue, false);
    } else {
      // include all items with sort value <= lastSortValue
      range = IDBKeyRange.upperBound(cursor.lastSortValue, false);
    }
  }

  const items = [];
  const seenLastId = cursor ? cursor.lastTweetId : null;
  let request = range
    ? index.openCursor(range, direction)
    : index.openCursor(null, direction);

  let foundLast = !cursor; // if no cursor, we don't need to skip anything

  while (true) {
    const event = await new Promise((resolve) => (request.onsuccess = resolve));
    const c = event.target.result;
    if (!c) break;

    if (!foundLast) {
      // keep advancing until we hit the exact tweet we stopped at last time
      if (c.value.tweetId === seenLastId) {
        foundLast = true;
      }
      c.continue();
      continue;
    }

    items.push(c.value);
    if (items.length >= pageSize) break;
    c.continue();
  }

  let nextCursor = null;
  if (items.length === pageSize) {
    const lastItem = items[items.length - 1];
    nextCursor = {
      lastSortValue: lastItem[sortField],
      lastTweetId: lastItem.tweetId,
    };
  }

  return { items, nextCursor };
}

async function getTweetsNumber() {
  const db = await getDB();
  const transaction = db.transaction([TWEET_STORE_NAME], "readonly");
  const store = transaction.objectStore(TWEET_STORE_NAME);
  const count = await new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return count;
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log(message);
  switch (message.action) {
    case "getTweetsPage":
      try {
        const tweets = await getTweetsPage({
          cursor: message.cursor || null,
          sortField: message.sortField || "viewedAt",
          ascending: message.ascending || false,
          pageSize: message.pageSize || 20,
        });
        console.log(tweets);
        sendResponse(tweets);
      } catch (err) {
        console.log(err);
        sendResponse({
          error: err,
        });
      }
      break;
    case "getTweetCount":
      try {
        const count = await getTweetsNumber();
        sendResponse({ count });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      break;
    case "readTweet":
      try {
        const tweet = message.tweet;

        const user = { ...tweet.user, ...tweet.user.extra };
        delete user.extra;

        delete tweet.user.extra;

        await addTweet(tweet);
        await addUser(user);

        sendResponse({ success: true });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message,
        });
      }
      break;
    case "updateTweetState":
      try {
        const existing = await getTweet(message.tweetId);
        if (existing) {
          const updated = {
            ...existing,
            isFavorite: message.isFavorite ?? existing.isFavorite,
            isBookmarked: message.isBookmarked ?? existing.isBookmarked,
            isRetweeted: message.isRetweeted ?? existing.isRetweeted,
            tweetStats: {
              ...existing.tweetStats,
              ...(message.tweetStats || {}),
            },
          };
          await addTweet(updated);
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      break;
    case "getAllTweets":
      try {
        const tweets = await getAllTweets();
        sendResponse({ result: tweets });
      } catch (err) {
        sendResponse({
          error: err.message,
        });
      }
      break;
    case "getAllUsers":
      try {
        const users = await getAllUsers();
        sendResponse({ result: users });
      } catch (err) {
        sendResponse({
          error: err.message,
        });
      }
      break;
    case "clearAll":
      try {
        await clearTweets();
        await clearUsers();
        //await getDbSize();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({
          success: false,
          error: err,
        });
      }
      break;
    case "getUserInfo":
      try {
        const user = await getUserInfo(message.userId);
        sendResponse({
          result: user,
        });
      } catch (err) {
        sendResponse({
          error: err,
        });
      }
      break;
    case "displayedTweet":
      try {
        sendResponse({
          success: true,
        });
      } catch (err) {
        sendResponse({
          error: err,
          success: false,
        });
      }
    default:
      sendResponse({
        error: "Unknown action",
      });
  }
});

// Extension Page
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: chrome.runtime.getURL("archive/index.html") });
});
