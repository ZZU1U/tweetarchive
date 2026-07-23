function isGraphQLTweetEndpoint(url) {
  return (
    url.includes("/i/api/graphql/") &&
    (url.includes("TweetDetail") ||
      url.includes("HomeTimeline") ||
      url.includes("UserTweets") ||
      url.includes("SearchTimeline"))
  );
}

function extractTweets(obj, found = []) {
  if (!obj || typeof obj !== "object") return found;

  if (obj.tweet_results && obj.tweet_results.result) {
    found.push(obj.tweet_results.result);
  }

  for (const value of Object.values(obj)) {
    if (typeof value === "object") extractTweets(value, found);
  }

  return found;
}

function normalizeTweet(result) {
  if (!result) return null;
  const legacy = result.legacy || {};
  const core = result.core?.user_results?.result?.legacy || {};

  return {
    rest_id: result.rest_id,
    text: legacy.full_text,
    created_at: legacy.created_at,
    user: {
      screen_name: core.screen_name,
      name: core.name,
      profile_image_url: core.profile_image_url_https,
    },
    // you can add media, retweet/quote info, etc.
    raw: result, // optional: keep full object if you need it
  };
}

window.fetch = async function (...args) {
  const [url, options] = args;

  // Call original fetch
  const response = await originalFetch.apply(this, args);

  // Only process if it's a tweet endpoint
  if (isGraphQLTweetEndpoint(url)) {
    try {
      // Clone the response so we can read it without consuming the original
      const clonedResponse = response.clone();
      const json = await clonedResponse.json();

      const tweets = extractTweets(json);
      tweets.forEach((tweet) => {
        const data = normalizeTweet(tweet);
        if (data) {
          // Send to isolated script
          window.postMessage(
            {
              source: "TWEET_ARCHIVE",
              type: "TWEET_DATA",
              payload: data,
            },
            "*",
          );
        }
      });
    } catch (err) {
      // Never break the page if parsing fails
      console.warn("Tweet interceptor fetch error:", err);
    }
  }

  return response;
};

const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method, url, ...rest) {
  this._url = url; // store for later
  return originalXHROpen.apply(this, [method, url, ...rest]);
};

XMLHttpRequest.prototype.send = function (body) {
  this.addEventListener("load", function () {
    if (isGraphQLTweetEndpoint(this._url)) {
      try {
        const json = JSON.parse(this.responseText);
        const tweets = extractTweets(json);
        tweets.forEach((tweet) => {
          const data = normalizeTweet(tweet);
          if (data) {
            window.postMessage(
              {
                source: "TWEET_ARCHIVE",
                type: "TWEET_DATA",
                payload: data,
              },
              "*",
            );
          }
        });
      } catch (err) {
        console.warn("Tweet interceptor XHR error:", err);
      }
    }
  });

  return originalXHRSend.apply(this, arguments);
};
