async function addTweet(tweet) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "addTweet", data: tweet },
      (response) => {
        if (!response) {
          reject("idk");
        } else if (response?.error) {
          reject(response.error);
        } else {
          resolve();
        }
      },
    );
  });
}

function articlesExist() {
  return !!document.querySelector("article");
}

function getHomeTimeLine() {
  return document.querySelector('[aria-label="Timeline: Your Home Timeline"]');
}

function getConvoTimeLine() {
  return document.querySelector('[aria-label="Timeline: Conversation"]');
}

function waitForElement(range, getElem, timeout = 3000) {
  return new Promise((resolve) => {
    // Check if it's already there
    const existing = getElem();
    if (existing) {
      resolve(existing);
      return;
    }

    // If not, watch for it
    const observer = new MutationObserver(() => {
      const container = getElem();
      if (container) {
        observer.disconnect();
        resolve(container);
      }
    });

    observer.observe(range, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(undefined); // Resolve with empty array so the rest of your parse continues
    }, timeout);
  });
}

async function parseTweet(tweet) {
  const headData = await waitForElement(tweet, () => {
    return tweet.querySelectorAll('div[data-testid="User-Name"] a');
  });
  if (!headData || headData.length < 3) return; // just to be sure
  const userName = headData[0].textContent;
  const userHandle = headData[1].textContent;
  const tweetId = headData[2].href;
  const tweetTime = await waitForElement(tweet, () => {
    return tweet.querySelector("time").dateTime;
  });
  const userPfp = await waitForElement(tweet, () => {
    return tweet.querySelector('[data-testid="Tweet-User-Avatar"] img')?.src;
  });
  const tweetText = await waitForElement(
    tweet,
    () => {
      const texts = tweet.querySelectorAll('div[data-testid="tweetText"]');
      if (texts.length == 0) return "";
      if (texts.length == 1) return texts[0].textContent;
      if (texts.length == 2)
        return `${texts[0].textContent}\n> ${texts[1].textContent}`;
      return "";
    },
    1000,
  );
  const tweetImagesAndVideos = await waitForElement(
    tweet,
    () => {
      const imgs = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
      return (
        imgs.length &&
        Array.from(imgs).map((i) => {
          return {
            alt: i?.alt,
            src: i?.src,
          };
        })
      );
    },
    3000,
  );
  const seenTime = new Date();

  const tweetData = {
    userName,
    userHandle,
    userPfp,
    tweetId,
    tweetTime,
    tweetText,
    tweetImagesAndVideos,
    seenTime,
  };

  try {
    await addTweet(tweetData);
  } catch (err) {
    // TODO update seenTime maybe?
  }

  // if there are more than one name, handle, content, pfp, time then it's retweet
  //console.log("images", tweet.querySelector('[alt="Image"]'));
}

async function checkTweets(mutations) {
  for (const mutation of mutations) {
    // If a new article was added.
    for (const node of mutation.addedNodes) {
      await parseTweet(node);
    }
  }
}

// (async function () {
//   let feed = await waitForElement(document.body, () => {
//     return articlesExist() && getHomeTimeLine()?.children[0];
//   });

//   for (const tweet of feed.children) {
//     parseTweet(tweet);
//   }

//   const observer = new MutationObserver(checkTweets);

//   observer.observe(feed, {
//     childList: true,
//     subtree: false,
//   });
// })();
