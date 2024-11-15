cache = new Map();

/**
 * Converts a user's belief choice to a numerical score.
 * @param {string} choice - The user's choice ('reject', 'neutral', 'support').
 * @returns {number} - Numerical score corresponding to the choice.
 */
function choiceToScore(choice) {
  switch (choice) {
  case 'reject':
    return -1;
  case 'neutral':
    return 0;
  case 'support':
    return 1;
  default:
    return 0;
  }
}

/**
 * Calculates the Pearson correlation coefficient between two arrays of scores.
 * @param {number[]} x - Array of scores from the first user.
 * @param {number[]} y - Array of scores from the second user.
 * @returns {number} - Pearson correlation coefficient.
 */
function pearsonCorrelation(x, y) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

/**
 * Fetches the beliefs of a user, using an in-memory cache to avoid redundant network requests.
 * @param {string} userId - The ID of the user whose beliefs are to be fetched.
 * @param {Map<string, Object>} cache - In-memory cache for user beliefs.
 * @returns {Promise<Object>} - A promise that resolves to the user's beliefs.
 */
async function fetchUserBeliefsCached(userId) {
  if (cache.has(userId)) {
    return cache.get(userId);
  }

  const encodedUserId = encodeURIComponent(userId);
  try {
    const response = await fetch(`/api/user-beliefs/${encodedUserId}`);

    if (!response.ok) {
      console.error(`Failed to fetch beliefs for user: ${userId}`);
      return {};
    }

    const data = await response.json();
    cache.set(userId, data);
    return data;
  } catch (error) {
    console.error(`Error fetching beliefs for user: ${userId}`, error);
    return {};
  }
}

/**
 * Higher-order function that caches the results of an asynchronous function in localStorage.
 * @param {Function} asyncFunc - The asynchronous function to wrap.
 * @param {Function} getCacheKey - Function to compute the cache key based on arguments.
 * @param {number} ttl - Time to live in milliseconds.
 * @returns {Function} - A wrapped function that caches its results.
 */
function withLocalStorageCache(asyncFunc, getCacheKey, ttl) {
  return async function(...args) {
    const cacheKey = getCacheKey(...args);
    const now = Date.now();
    const cacheEntry = localStorage.getItem(cacheKey);

    if (cacheEntry) {
      const parsedEntry = JSON.parse(cacheEntry);
      if (now - parsedEntry.timestamp < ttl) {
        // Cache is valid
        return parsedEntry.value;
      } else {
        // Cache expired
        localStorage.removeItem(cacheKey);
      }
    }

    const result = await asyncFunc(...args);

    // Cache the result, even if it's null
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ value: result, timestamp: now })
    );

    return result;
  };
}

/**
 * Computes the correlation between two users' beliefs.
 * @param {string} userId1 - The ID of the first user.
 * @param {string} userId2 - The ID of the second user.
 * @param {Map<string, Object>} beliefsCache - In-memory cache for user beliefs.
 * @returns {Promise<number|null>} - The correlation coefficient or null if not enough data.
 */
async function computeCorrelation(userId1, userId2, beliefsCache = cache) {
  const [userBeliefs1, userBeliefs2] = await Promise.all([
    fetchUserBeliefsCached(userId1),
    fetchUserBeliefsCached(userId2),
  ]);

  const beliefNames = Object.keys(userBeliefs1).filter((beliefName) => {
    return (
      userBeliefs1[beliefName].choice && userBeliefs2[beliefName]?.choice
    );
  });

  if (beliefNames.length < 5) {
    return null;
  }

  const scores1 = beliefNames.map((beliefName) =>
    choiceToScore(userBeliefs1[beliefName].choice)
  );
  const scores2 = beliefNames.map((beliefName) =>
    choiceToScore(userBeliefs2[beliefName].choice)
  );

  const correlation = pearsonCorrelation(scores1, scores2);
  return correlation;
}

// Wrap computeCorrelation with caching
const computeCorrelationWithUser = withLocalStorageCache(
  computeCorrelation,
  (userId1, userId2) => `beliefs_cache_${userId1}_${userId2}`,
  10 * 60 * 1000 // TTL of 10 minutes
);

/**
 * Gets a color representation for a given correlation coefficient.
 * @param {number} correlation - The correlation coefficient.
 * @returns {string} - A CSS color string.
 */
function getColorForCorrelation(correlation) {
  // Map -1 (red) to 0 (yellow) to 1 (green)
  const red = { r: 255, g: 0, b: 0 };
  const yellow = { r: 255, g: 255, b: 0 };
  const green = { r: 0, g: 128, b: 0 };

  let color;
  if (correlation < 0) {
    const factor = (correlation + 1) / 1; // Map -1 to 0, 0 to 1
    color = {
      r: red.r + factor * (yellow.r - red.r),
      g: red.g + factor * (yellow.g - red.g),
      b: red.b + factor * (yellow.b - red.b),
    };
  } else {
    const factor = correlation / 1; // Map 0 to 0, 1 to 1
    color = {
      r: yellow.r + factor * (green.r - yellow.r),
      g: yellow.g + factor * (green.g - yellow.g),
      b: yellow.b + factor * (green.b - yellow.b),
    };
  }

  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(
      color.b
    )})`;
}

/**
 * Extracts core beliefs from a user's beliefs data.
 * Core beliefs are those with a 'preference' property greater than 0.
 *
 * @param {Object} beliefsData - The user's beliefs data.
 * @returns {Array<string>} - An array of core belief names.
 */
function getCoreBeliefs(beliefsData) {
  return Object.keys(beliefsData).filter((beliefName) => {
    const belief = beliefsData[beliefName];
    return typeof belief.preference === 'number' && belief.preference > 0;
  }).map(belief => ({ belief, choice: beliefsData[belief].choice }));
}

/**
 * Adds correlation indicators to username elements on the page.
 * It fetches beliefs and computes correlations, caching results appropriately.
 * @returns {Promise<void>}
 */
async function addCorrelationBullets() {
  const authenticatedUserId = window.authenticatedUserId;

  const usernameElements = document.querySelectorAll(
    '.username[data-username]'
  );

  for (const element of usernameElements) {
    const otherUserId = element.getAttribute('data-username');

    const correlation = !!authenticatedUserId ?
          await computeCorrelationWithUser(
            authenticatedUserId,
            otherUserId,
            cache
          ) : null;

    const bullet = document.createElement('span');
    bullet.className = 'correlation-bullet';
    let title;

    if (!authenticatedUserId) {
      title = 'Log in to compute belief correlation';
      bullet.style.display = 'none';
    } else if (otherUserId === authenticatedUserId) {
      bullet.style.backgroundColor = 'white';
      title = '(You)';
    } else if (correlation === null) {
      bullet.style.backgroundColor = '#cccccc';
      title = 'Unable to compute correlation. Not enough data.';
    } else {
      const color = getColorForCorrelation(correlation);
      bullet.style.backgroundColor = color;
      const percentage = (correlation * 100).toFixed(2);
      title = `Correlation with ${otherUserId}: ${percentage}%`;
    }


    if (typeof tippy !== 'undefined') {
      tippy.setDefaultProps({ maxWidth: '' });
      tippy(element, {
        content: title,
        placement: 'right-start',
        inlinePositioning: false,
        onTrigger: async (instance, event) => {
          const otherUserCoreBeliefs = getCoreBeliefs(
            await fetchUserBeliefsCached(otherUserId)
          );
          let newContent = title + (
            otherUserCoreBeliefs.length ?
              '\n\n' +
              otherUserCoreBeliefs.map(({ belief, choice }) =>
                window.formatChoice(choice, belief, 'light')
              ).join('\n')
            : ''
          );
          instance.setContent(newContent);
        }
      });
    } else {
      element.title = title;
    }

    element.prepend(bullet);
    if (authenticatedUserId) {
      element.classList.add('correlated');
    }
  }
}

/**
 * Flushes the localStorage cache by removing all entries that start with 'beliefs_cache_'.
 */
function flushBeliefsCache() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('beliefs_cache_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

// Expose functions if needed
window.addCorrelationBullets = addCorrelationBullets;
window.flushBeliefsCache = flushBeliefsCache;

// Bind the function to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  addCorrelationBullets();
});
