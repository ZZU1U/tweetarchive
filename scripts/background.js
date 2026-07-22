const DB_NAME = "tweetarchive";
const DB_VERSION = 2;
const STORE_NAME = "seentweets";

let dbPromise = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, {
            keyPath: "tweetId",
          });
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

async function addTweet(tweet) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.add(tweet);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      if (event.target.error.name === "ConstraintError") {
        resolve(); // ignore duplicates
      } else {
        reject(event.target.error);
      }
    };
  });
}

async function getAllTweets() {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

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
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// async function hasTweetBeenSeen(tweetId) {
//   const db = await getDB();
//   return new Promise((resolve, reject) => {
//     const transaction = db.transaction([STORE_NAME], "readonly");
//     const store = transaction.objectStore(STORE_NAME);
//     const index = store.index("tweetId");
//     const request = index.get(tweetId);
//     request.onsuccess = (event) => {
//       const result = event.target.result;
//       resolve(!!result);
//     };
//     request.onerror = (event) => {
//       console.error(`Error checking tweet ${tweetId}:`, event.target.error);
//       reject(event.target.error);
//     };
//   });
// }

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log(message);
  switch (message.action) {
    case "addTweet":
      try {
        await addTweet(message.data);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message,
        });
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
    case "clearTweets":
      try {
        await clearTweets();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({
          error: err,
        });
      }
      break;
    default:
      sendResponse({
        error: "Unknown action",
      });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: chrome.runtime.getURL("archive/index.html") });
});
