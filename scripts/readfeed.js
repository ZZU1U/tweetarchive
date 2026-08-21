// Which endpoint types are currently enabled (set by relay via custom event)
let enabledSources = {
  homeTimeline: true,
  tweetDetail: true,
  userTweets: true,
  searchTimeline: true,
};

// Listen for settings updates from the relay script
window.addEventListener("TWEET_ARCHIVE_SETTINGS", (event) => {
  if (event.detail && event.detail.saveSources) {
    enabledSources = event.detail.saveSources;
  }
});

function sourceTypeFromUrl(url) {
  if (url.includes("HomeTimeline")) return "homeTimeline";
  if (url.includes("TweetDetail")) return "tweetDetail";
  if (url.includes("UserTweets")) return "userTweets";
  if (url.includes("SearchTimeline")) return "searchTimeline";
  return null;
}

// Action endpoints that update a tweet's state (likes, bookmarks, retweets).
// These are always intercepted regardless of saveSources, because they only
// update existing archived tweets rather than saving new ones.
function actionTypeFromUrl(url) {
  if (url.includes("FavoriteTweet")) return "favorite";
  if (url.includes("UnfavoriteTweet")) return "unfavorite";
  if (url.includes("CreateBookmark")) return "bookmark";
  if (url.includes("DeleteBookmark")) return "unbookmark";
  if (url.includes("CreateRetweet")) return "retweet";
  if (url.includes("DeleteRetweet")) return "unretweet";
  return null;
}

function isGraphQLTweetEndpoint(url) {
  if (!url.includes("/i/api/graphql/")) return false;

  // Action endpoints are always captured
  if (actionTypeFromUrl(url)) return true;

  // Timeline endpoints respect the settings
  const sourceType = sourceTypeFromUrl(url);
  if (!sourceType) return false;
  return !!enabledSources[sourceType];
}

function extractTweets(obj, found = []) {
  if (!obj || typeof obj !== "object") return found;

  if (obj.tweet_results && obj.tweet_results.result) {
    found.push(obj.tweet_results.result);
  } else {
    for (const value of Object.values(obj)) {
      if (typeof value === "object") extractTweets(value, found);
    }
  }

  return found;
}

// Extract a single updated tweet from an action endpoint response
// (e.g. data.favorite_tweet.tweet_results.result, data.create_retweet.retweet_results.result)
function extractTweetFromAction(json) {
  if (!json || typeof json !== "object") return null;
  const data = json.data;
  if (!data || typeof data !== "object") return null;

  for (const value of Object.values(data)) {
    if (!value || typeof value !== "object") continue;
    if (value.tweet_results && value.tweet_results.result) {
      return value.tweet_results.result;
    }
    if (value.retweet_results && value.retweet_results.result) {
      return value.retweet_results.result;
    }
  }
  return null;
}

// Shared handler for all intercepted GraphQL responses.
// - Action endpoints -> post a TWEET_STATE_UPDATE (partial state only)
// - Timeline / detail endpoints -> post TWEET_DATA (full tweet)
function handleGraphQLResponse(url, json) {
  const actionType = actionTypeFromUrl(url);

  if (actionType) {
    const result = extractTweetFromAction(json);
    const data = result ? normalizeTweet(result) : null;
    if (data) {
      window.postMessage(
        {
          source: "TWEET_ARCHIVE",
          type: "TWEET_STATE_UPDATE",
          payload: {
            tweetId: data.tweetId,
            isFavorite: data.isFavorite,
            isBookmarked: data.isBookmarked,
            isRetweeted: data.isRetweeted,
            tweetStats: data.tweetStats,
          },
        },
        "*",
      );
    }
    return;
  }

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
}

function normalizeTweet(result) {
  if (!result || !result?.legacy) return null;

  const tweetText = result?.quoted_status_result?.result?.legacy?.full_text
    ? (result?.legacy?.full_text || "") +
      "\n> " +
      (result?.quoted_status_result?.result?.legacy?.full_text || "").replace(
        "\n",
        "\n> ",
      )
    : result?.legacy?.full_text;

  const allMedia = (result?.legacy?.entities?.media || []).concat(
    result?.quoted_status_result?.result?.legacy?.entities?.media || [],
  );

  return {
    tweetId: result.rest_id,
    tweetText,
    postedAt: new Date(result?.legacy.created_at),
    viewedAt: new Date(),
    tweetMedia: allMedia.map((m) => {
      return m.media_url_https;
    }),
    isQuote: result?.legacy.is_quote_status,
    isFavorite: result?.legacy.favorited,
    isBookmarked: result?.legacy.bookmarked,
    isRetweeted: result?.legacy.retweeted,
    isSensetive: result?.legacy.possibly_sensitive,
    user: {
      name: result?.core.user_results.result?.core.name,
      username: result?.core.user_results.result?.core.screen_name,
      profile_image_url: result?.core.user_results.result?.avatar.image_url,
      isVerified: result?.core.user_results.result?.is_blue_verified,
      isParody: result?.core.user_results.result?.parody_commentary_fan_label,
      userId: result?.core?.user_results?.result?.rest_id,
      extra: {
        description: result?.core.user_results.result?.profile_bio?.description,
        createdAt: new Date(result?.core.user_results.result?.core?.created_at),
        banner: result?.core.user_results.result?.legacy?.profile_banner_url,
        location: result?.core.user_results.result?.legacy?.location?.location,
        followers: result?.core.user_results.result?.legacy?.followers_count,
        friends: result?.core.user_results.result?.legacy?.friends_count,
        tweets: result?.core.user_results.result?.legacy?.statuses_count,
      },
    },
    tweetStats: {
      bookmarks: result?.legacy.bookmark_count,
      favorites: result?.legacy.favorite_count,
      quotes: result?.legacy.quote_count,
      replies: result?.legacy.reply_count,
      retweets: result?.legacy.retweet_count,
      views: Number(result?.views.count),
    },
    // raw: result, // optional: keep full object if you need it
  };
}

// Keep a reference to the real fetch before patching
const originalFetch = window.fetch.bind(window);

window.fetch = async function (...args) {
  const [url, options] = args;

  const response = await originalFetch.apply(this, args);

  if (isGraphQLTweetEndpoint(url)) {
    try {
      const clonedResponse = response.clone();
      const json = await clonedResponse.json();
      handleGraphQLResponse(url, json);
    } catch (err) {
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
        handleGraphQLResponse(this._url, json);
      } catch (err) {
        console.warn("Tweet interceptor XHR error:", err);
      }
    }
  });

  return originalXHRSend.apply(this, arguments);
};
