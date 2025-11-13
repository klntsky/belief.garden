// src/utils/userUtils.js

import fs from 'fs/promises';
import path from 'path';
import { writeFileAtomic } from './fileUtils.js';
import { feedQueue, notificationQueue, userBeliefsManager } from './queueUtils.js';

const userAccountsDir = path.join('data', 'accounts');
const userBeliefsDir = path.join('data', 'users');
const userBiosDir = path.join('data', 'bio');
const userSettingsDir = path.join('data', 'settings');
const notificationsDir = path.join('data', 'notifications');
const followersDir = path.join('data', 'followers');
const followsDir = path.join('data', 'follows');

const MAX_NOTIFICATIONS = 200;
const MAX_FEED_ENTRIES = 400;
const FEED_FILE = path.join('data', 'feed.json');
// MUST be synchronized with the frontend in feed.js:
const CHOICE_CHANGE_MERGE_FEED_ENTRIES_TIMEOUT = 300;

// Default settings for new users
const defaultSettings = {
  allowAllDebates: true,
  // Add any future settings here
};

/**
 * Get the file path of a user's beliefs JSON file.
 * @param {string} username - The username of the user.
 * @returns {string} - The file path to the user's beliefs JSON file.
 */
export function getUserBeliefsFilePath(username) {
  return path.join(userBeliefsDir, `${username}.json`);
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
}

export function assertUsername(username) {
  if (!isValidUsername(username)) {
    throw 'Invalid username';
  }
}

export async function doesUserExist(username) {
  assertUsername(username);
  const userFilePath = path.join(userAccountsDir, `${username}.json`);
  if (fs.existsSync(userFilePath)) {
    return true;
  }

  return false;
}

/**
 * Get a user by their username.
 * @param {string} username - The username of the user.
 * @returns {Promise<Object|null>} - The user object or null if not found.
 */
export async function getUserByUsername(username) {
  assertUsername(username);
  const userFilePath = path.join(userAccountsDir, `${username}.json`);
  try {
    const data = await fs.readFile(userFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // User does not exist
    } else {
      throw err;
    }
  }
}

export async function userExists (username) {
  assertUsername(username);
  try {
    const filesInDirectory = await fs.readdir(userAccountsDir);
    return filesInDirectory.some(file => file.toLowerCase() === `${username.toLowerCase()}.json`);
  } catch (error) {
    return false;
  }
}

/**
 * Add a new user.
 * @param {Object} user - The user object to add.
 * @returns {Promise<void>}
 */
export async function addUser(user) {
  assertUsername(user);
  const userFilePath = path.join(userAccountsDir, `${user.username}.json`);
  try {
    await fs.access(userFilePath);
    throw new Error('User already exists.');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const dirPath = userAccountsDir;
      try {
        await fs.access(dirPath);
      } catch (dirErr) {
        if (dirErr.code === 'ENOENT') {
          await fs.mkdir(dirPath, { recursive: true });
        } else {
          throw dirErr;
        }
      }
      await writeFileAtomic(userFilePath, JSON.stringify(user, null, 2));
    } else {
      throw err;
    }
  }
}

/**
 * Update a user's password.
 * @param {string} username - The username of the user.
 * @param {string} newPasswordHash - The new hashed password.
 * @returns {Promise<void>}
 */
export async function updateUserPassword(username, newPasswordHash) {
  assertUsername(username);
  const user = await getUserByUsername(username);
  if (user) {
    user.passwordHash = newPasswordHash;
    await saveUser(user);
  } else {
    throw new Error('User not found.');
  }
}

/**
 * Save a user object to its file.
 * @param {Object} user - The user object to save.
 * @returns {Promise<void>}
 */
async function saveUser(user) {
  assertUsername(user);
  const userFilePath = path.join(userAccountsDir, `${user.username}.json`);
  await writeFileAtomic(userFilePath, JSON.stringify(user, null, 2));
}

/**
 * Get all usernames.
 * @returns {Promise<Array<string>>} - An array of usernames.
 */
export async function getAllUsernames() {
  try {
    const files = await fs.readdir(userAccountsDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.basename(file, '.json'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []; // Directory does not exist yet
    } else {
      throw err;
    }
  }
}

/**
 * Get user beliefs asynchronously.
 * @param {string} username - The username of the user.
 * @returns {Promise<Object>} - The user's beliefs.
 */
export async function getUserBeliefs(username) {
  assertUsername(username);
  const userBeliefsFilePath = path.join(userBeliefsDir, `${username}.json`);
  try {
    const data = await fs.readFile(userBeliefsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {}; // Return an empty object if the file doesn't exist
    } else {
      throw err;
    }
  }
}

/**
 * Save user beliefs.
 * @param {string} username - The username of the user.
 * @param {Object} data - The beliefs data to save.
 * @returns {Promise<void>}
 */
export async function saveUserBeliefs(username, data) {
  assertUsername(username);
  const userBeliefsFilePath = path.join(userBeliefsDir, `${username}.json`);
  await writeFileAtomic(userBeliefsFilePath, JSON.stringify(data, null, 2));
}

/**
 * Toggle favorite status by adding or removing preference.
 * @param {string} username - The username of the user.
 * @param {string} beliefName - The name of the belief.
 * @returns {Promise<boolean>} - True if now a favorite, false otherwise.
 */
export async function toggleUserFavorite(username, beliefName) {
  assertUsername(username);
  const userBeliefs = await getUserBeliefs(username);

  // Check if the user has more than 20 favorite beliefs
  const favoriteBeliefs = Object.values(userBeliefs).filter(
    (belief) => typeof belief.preference === 'number'
  );

  if (
    favoriteBeliefs.length >= 20 &&
    typeof userBeliefs[beliefName]?.preference !== 'number'
  ) {
    throw new Error('You cannot have more than 20 core beliefs.');
  }

  if (!userBeliefs[beliefName]) {
    userBeliefs[beliefName] = {};
  }

  if (typeof userBeliefs[beliefName].preference === 'number') {
    // Remove preference
    delete userBeliefs[beliefName].preference;
    await saveUserBeliefs(username, userBeliefs);
    return false; // Not a favorite anymore
  } else {
    // Add preference
    const points = calculateInitialPoints(userBeliefs);
    userBeliefs[beliefName].preference = points;
    await saveUserBeliefs(username, userBeliefs);
    return true; // Now a favorite
  }
}

/**
 * Calculate initial points for a new favorite belief.
 * @param {Object} userBeliefs - The user's beliefs object.
 * @returns {number} - The calculated initial points.
 */
function calculateInitialPoints(userBeliefs) {
  const preferences = Object.values(userBeliefs)
    .map((belief) => belief.preference)
    .filter((preference) => typeof preference === 'number');

  if (preferences.length === 0) {
    return 10; // First favorite
  }
  const total = preferences.reduce((sum, val) => sum + val, 0);
  return Math.round(total / preferences.length); // Average of existing points
}

/**
 * Adjust preference points for a belief.
 * @param {string} username - The username of the user.
 * @param {string} beliefName - The name of the belief.
 * @param {string} action - 'increase' or 'decrease'.
 * @returns {Promise<Object>} - The updated user beliefs.
 */
export async function adjustPieSlicePoints(username, beliefName, action) {
  assertUsername(username);
  const userBeliefs = await getUserBeliefs(username);

  const coreBeliefs = [];
  Object.entries(userBeliefs).forEach(([belief, { preference }]) => {
    if (typeof preference === 'number' && preference > 0) {
      coreBeliefs.push(belief);
    }
  });

  // Ensure the belief exists and has a preference
  if (
    !userBeliefs[beliefName] ||
    typeof userBeliefs[beliefName].preference !== 'number'
  ) {
    throw new Error('Belief not found in favorites.');
  }

  // Increase or decrease the preference
  let points = userBeliefs[beliefName].preference;
  points = Math.round(points * (action === 'increase' ? 1.1 : 0.9));

  // Update the belief's preference
  userBeliefs[beliefName].preference = points;

  // Recalculate total preference sum
  const totalPreference = Object.values(userBeliefs)
    .filter((belief) => typeof belief.preference === 'number')
    .reduce((sum, belief) => sum + belief.preference, 0);

  if (totalPreference > Number.MAX_SAFE_INTEGER / 2) {
    throw new Error('Decrease your preference for other beliefs.');
  }

  // Check if any belief exceeds 90% of the total preference
  const maxAllowedPreference = Math.round(totalPreference * 0.9);
  if (points > maxAllowedPreference) {
    throw new Error(
      'No single belief can have more than 90% of the total preference.'
    );
  }

  // Check if any belief is less than 2% of the total preference
  const minAllowedPreference = Math.round(totalPreference * 0.02);
  for (const coreBelief of coreBeliefs) {
    if (userBeliefs[coreBelief].preference < minAllowedPreference) {
      throw new Error(
        `No belief can have less than 2% of the total preference (remove or prioritize '${coreBelief}').`
      );
    }
  }

  // Save updated beliefs
  await saveUserBeliefs(username, userBeliefs);

  return userBeliefs;
}

/**
 * Execute a callback in a queue dedicated to a specific user's beliefs
 * @param {string} username - The username whose beliefs are being operated on
 * @param {Function} callback - Async function to execute in the queue
 * @returns {Promise<T>} The result of the callback
 * @template T
 */
export async function withUserBeliefs(username, callback) {
  if (!username) {
    throw new Error('Username is required for belief operations');
  }
  assertUsername(username);

  try {
    const result = await userBeliefsManager.executeInQueue(username, callback);
    userBeliefsManager.cleanupQueue(username); // Clean up if queue is empty
    return result;
  } catch (error) {
    console.error(`Error in belief operation for user ${username}:`, error);
    throw error;
  }
}

/**
 * Get user settings.
 * @param {string} username - The username of the user.
 * @returns {Promise<Object>} - The user's settings.
 */
export async function getUserSettings(username) {
  assertUsername(username);
  const settingsPath = path.join(userSettingsDir, `${username}.json`);
  try {
    const data = await fs.readFile(settingsPath, 'utf8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ...defaultSettings };
    }
    throw err;
  }
}

/**
 * Save user settings.
 * @param {string} username - The username of the user.
 * @param {Object} settings - The settings to save.
 * @returns {Promise<void>}
 */
export async function saveUserSettings(username, settings) {
  assertUsername(username);
  const settingsPath = path.join(userSettingsDir, `${username}.json`);
  try {
    await fs.mkdir(userSettingsDir, { recursive: true });
    await writeFileAtomic(settingsPath, JSON.stringify(settings, null, 2));
  } catch (err) {
    throw err;
  }
}

/**
 * Get user bio.
 * @param {string} username - The username of the user.
 * @returns {Promise<string>} - The user's bio text.
 */
export async function getUserBio(username) {
  assertUsername(username);
  const bioFilePath = path.join(userBiosDir, `${username}.md`);
  try {
    const data = await fs.readFile(bioFilePath, 'utf8');
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return ''; // Return empty string if file doesn't exist
    } else {
      throw err;
    }
  }
}

/**
 * Save user bio.
 * @param {string} username - The username of the user.
 * @param {string} bioText - The bio text to save.
 * @returns {Promise<void>}
 */
export async function saveUserBio(username, bioText) {
  assertUsername(username);
  if (bioText.length > 1500) {
    throw new Error('Bio cannot exceed 1500 characters.');
  }

  const dirPath = userBiosDir;
  try {
    await fs.access(dirPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw err;
    }
  }

  const bioFilePath = path.join(dirPath, `${username}.md`);
  await writeFileAtomic(bioFilePath, bioText);
}

/**
 * Delete a user's account, including their account file, beliefs file, and bio.
 * @param {string} username - The username of the user.
 * @returns {Promise<void>}
 */
export async function deleteUserAccount(username) {
  assertUsername(username);
  // Delete account file
  const userFilePath = path.join(userAccountsDir, `${username}.json`);
  await fs.unlink(userFilePath).catch((err) => {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  });

  // Delete beliefs file
  const userBeliefsFilePath = path.join(userBeliefsDir, `${username}.json`);
  await fs.unlink(userBeliefsFilePath).catch((err) => {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  });

  // Delete bio file
  const bioFilePath = path.join(userBiosDir, `${username}.md`);
  await fs.unlink(bioFilePath).catch((err) => {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  });

  // Delete settings file
  const userSettingsFilePath = path.join(userSettingsDir, `${username}.json`);
  await fs.unlink(userSettingsFilePath).catch((err) => {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  });
}

/**
 * Get a user's notifications
 * @param {string} username - The username of the user
 * @returns {Promise<Array>} - Array of notification objects
 */
export async function getUserNotifications(username) {
  assertUsername(username);
  const notificationPath = path.join(notificationsDir, `${username}.json`);
  try {
    await fs.access(notificationPath);
    const data = await fs.readFile(notificationPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // If file doesn't exist, create it with empty array
      await fs.mkdir(notificationsDir, { recursive: true });
      await fs.writeFile(notificationPath, '[]', 'utf8');
      return [];
    }
    throw err;
  }
}

/**
 * Push a notification to a user
 * @param {string} username - The username of the recipient
 * @param {Object} notification - The notification object to add
 * @returns {Promise<void>}
 */
export async function pushNotificationToUser(username, notification) {
  assertUsername(username);
  const notificationPath = path.join(notificationsDir, `${username}.json`);
  try {
    await notificationQueue.add(async () => {
      const notifications = await getUserNotifications(username);
      notifications.unshift({
        ...notification,
        timestamp: Date.now()
      });
      // Keep only the most recent MAX_NOTIFICATIONS
      if (notifications.length > MAX_NOTIFICATIONS) {
        notifications.length = MAX_NOTIFICATIONS;
      }
      await writeFileAtomic(notificationPath, JSON.stringify(notifications, null, 2));
    });
  } catch (err) {
    console.error(`Failed to push notification to ${username}:`, err);
  }
}

/**
 * Push a notification to all followers of a user
 * @param {string} username - The username whose followers should receive the notification
 * @param {Object} notification - The notification object to add
 * @returns {Promise<void>}
 */
export async function pushNotificationToFollowers(username, notification) {
  assertUsername(username);
  try {
    const followers = await getUserFollowers(username);
    await Promise.all(followers.map(follower =>
      pushNotificationToUser(follower, notification)
    ));
    return followers;
  } catch (err) {
    console.error(`Failed to push notification to followers of ${username}:`, err);
  }
}

/**
 * Get a user's followers
 * @param {string} username - The username of the user
 * @returns {Promise<Array<string>>} - Array of follower usernames
 */
export async function getUserFollowers(username) {
  assertUsername(username);
  const followersPath = path.join(followersDir, `${username}.json`);
  try {
    await fs.access(followersPath);
    const data = await fs.readFile(followersPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // If file doesn't exist, create it with empty array
      await fs.mkdir(followersDir, { recursive: true });
      await fs.writeFile(followersPath, '[]', 'utf8');
      return [];
    }
    throw err;
  }
}

/**
 * Get list of users that a user follows
 * @param {string} username - The username to get following list for
 * @returns {Promise<string[]>} List of usernames the user follows
 */
export async function getUserFollowing(username) {
  assertUsername(username);
  const followingPath = path.join(followsDir, `${username}.json`);
  try {
    const following = JSON.parse(await fs.readFile(followingPath, 'utf8'));
    return following;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Update both follower and following relationships
 * @param {string} targetUser - The user being followed
 * @param {string} follower - The user who is following
 * @param {boolean} isFollowing - True to follow, false to unfollow
 * @returns {Promise<void>}
 */
async function updateFollowRelationship(targetUser, follower, isFollowing) {
  assertUsername(targetUser);
  assertUsername(follower);
  const followersPath = path.join(followersDir, `${targetUser}.json`);
  const followingPath = path.join(followsDir, `${follower}.json`);

  // Get current lists
  const [followers, following] = await Promise.all([
    getUserFollowers(targetUser),
    getUserFollowing(follower)
  ]);

  // Update followers list
  const followerIndex = followers.indexOf(follower);
  const isCurrentlyFollowing = followerIndex !== -1;

  if (isFollowing && !isCurrentlyFollowing) {
    followers.push(follower);
  } else if (!isFollowing && isCurrentlyFollowing) {
    followers.splice(followerIndex, 1);
  }

  // Update following list
  const followingIndex = following.indexOf(targetUser);
  const isCurrentlyInFollowing = followingIndex !== -1;

  if (isFollowing && !isCurrentlyInFollowing) {
    following.push(targetUser);
  } else if (!isFollowing && isCurrentlyInFollowing) {
    following.splice(followingIndex, 1);
  }

  // Save both files atomically
  await Promise.all([
    writeFileAtomic(followersPath, JSON.stringify(followers, null, 2)),
    writeFileAtomic(followingPath, JSON.stringify(following, null, 2))
  ]);

  // Send notification
  if (isFollowing !== isCurrentlyFollowing) {
    await pushNotificationToUser(targetUser, {
      type: isFollowing ? 'new_follower' : 'unfollowed',
      actor: follower
    });
  }
}

/**
 * Add a follower to a user
 * @param {string} username - The username of the user to follow
 * @param {string} followerUsername - The username of the follower
 * @returns {Promise<void>}
 */
export async function addFollower(username, followerUsername) {
  assertUsername(username);
  assertUsername(followerUsername);
  await updateFollowRelationship(username, followerUsername, true);
}

/**
 * Remove a follower from a user
 * @param {string} username - The username of the user to unfollow
 * @param {string} followerUsername - The username of the follower to remove
 * @returns {Promise<void>}
 */
export async function removeFollower(username, followerUsername) {
  assertUsername(username);
  assertUsername(followerUsername);
  await updateFollowRelationship(username, followerUsername, false);
}

/**
 * Post a feed entry.
 * @param {Object} entry - The feed entry to post.
 * @returns {Promise<void>}
 */
export async function postFeed(entry) {
  if (!entry.actor) {
    throw new Error('Actor is required for feed entries');
  }

  try {
    await feedQueue.add(async () => {
      let feed = await getFeed();

      // some of the feed entries should be unique.

      const timestamp = Math.floor(Date.now() / 1000);

      if (entry.type === 'new_comment') {
        feed = feed.filter(
          feedEntry => feedEntry.actor != entry.actor
            || feedEntry.type === entry.type
            || feedEntry.beliefName != entry.beliefName
        );
      } else if (entry.type === 'choice_changed') {
        feed = feed.filter(feedEntry => {
          if (feedEntry.actor != entry.actor ||
              feedEntry.type != 'choice_changed' ||
              feedEntry.beliefName != entry.beliefName ||
              feedEntry.timestamp < timestamp - CHOICE_CHANGE_MERGE_FEED_ENTRIES_TIMEOUT
             ) return true;
          // NOTE: we do want to push a new entry in which old choice = new choice,
          // to overwrite the older decision on the front-end side.
          // e.g.:
          // user1: Belief1: none -> support (pushes entry1 to the feed)
          // user2: *loads the feed*
          // user1: Belief1: support -> none (**pushes to the feed**, entry1 gets removed, and entry2 gets pushed with the most recent timestamp, with "none -> none" choices)
          // user2: *loads new feed entries* (entry2)
          // user2: entry1 gets removed from the DOM because it's a duplicate
          // user2: entry2 does not get added to the DOM because its old_chocie == new_choice
          entry.old_choice = feedEntry.old_choice || null;
          return false;
        });
      }

      const feedEntry = {
        ...entry,
        timestamp
      };

      feed.unshift(feedEntry);
      feed = feed.slice(0, MAX_FEED_ENTRIES);

      await writeFileAtomic(FEED_FILE, JSON.stringify(feed, null, 2));
    });
  } catch (error) {
    console.error('Error writing feed file:', error);
    throw error;
  }
}

/**
 * Get the feed.
 * @returns {Promise<Array>} - The feed entries.
 */
export async function getFeed() {
  try {
    const feed = JSON.parse(await fs.readFile(FEED_FILE, 'utf8'));
    return feed;
  } catch (error) {
    console.error('Error reading feed file:', error);
    return [];
  }
}
