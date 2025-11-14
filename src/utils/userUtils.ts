// src/utils/userUtils.ts

import fs from 'fs/promises';
import path from 'path';
import { writeFileAtomic } from './fileUtils.js';
import { feedQueue, notificationQueue, userBeliefsManager } from './queueUtils.js';
import type { User, UserBeliefs, UserSettings, Notification, FeedEntry } from '../types/index.js';

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
const defaultSettings: UserSettings = {
  allowAllDebates: true,
  // Add any future settings here
};

/**
 * Get the file path of a user's beliefs JSON file.
 * @param username - The username of the user.
 * @returns The file path to the user's beliefs JSON file.
 */
export function getUserBeliefsFilePath(username: string): string {
  return path.join(userBeliefsDir, `${username}.json`);
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
}

export function assertUsername(username: string): asserts username is string {
  if (!isValidUsername(username)) {
    throw new Error('Invalid username');
  }
}

export async function doesUserExist(username: string): Promise<boolean> {
  assertUsername(username);
  const userFilePath = path.join(userAccountsDir, `${username}.json`);
  try {
    await fs.access(userFilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a user by their username.
 * @param username - The username of the user.
 * @returns The user object or null if not found.
 */
export async function getUserByUsername(username: string): Promise<User | null> {
  assertUsername(username);
  const userFilePath = path.join(userAccountsDir, `${username}.json`);
  try {
    const data = await fs.readFile(userFilePath, 'utf8');
    return JSON.parse(data) as User;
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      return null; // User does not exist
    } else {
      throw err;
    }
  }
}

export async function userExists(username: string): Promise<boolean> {
  assertUsername(username);
  try {
    const filesInDirectory = await fs.readdir(userAccountsDir);
    return filesInDirectory.some(file => file.toLowerCase() === `${username.toLowerCase()}.json`);
  } catch {
    return false;
  }
}

/**
 * Add a new user.
 * @param user - The user object to add.
 */
export async function addUser(user: User): Promise<void> {
  assertUsername(user.username);
  const userFilePath = path.join(userAccountsDir, `${user.username}.json`);
  try {
    await fs.access(userFilePath);
    throw new Error('User already exists.');
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      const dirPath = userAccountsDir;
      try {
        await fs.access(dirPath);
      } catch (dirErr) {
        const dirError = dirErr as { code?: string };
        if (dirError.code === 'ENOENT') {
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
 * @param username - The username of the user.
 * @param newPasswordHash - The new hashed password.
 */
export async function updateUserPassword(username: string, newPasswordHash: string): Promise<void> {
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
 * @param user - The user object to save.
 */
async function saveUser(user: User): Promise<void> {
  assertUsername(user.username);
  const userFilePath = path.join(userAccountsDir, `${user.username}.json`);
  await writeFileAtomic(userFilePath, JSON.stringify(user, null, 2));
}

/**
 * Get all usernames.
 * @returns An array of usernames.
 */
export async function getAllUsernames(): Promise<string[]> {
  try {
    const files = await fs.readdir(userAccountsDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.basename(file, '.json'));
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      return []; // Directory does not exist yet
    } else {
      throw err;
    }
  }
}

/**
 * Get user beliefs asynchronously.
 * @param username - The username of the user.
 * @returns The user's beliefs.
 */
export async function getUserBeliefs(username: string): Promise<UserBeliefs> {
  assertUsername(username);
  const userBeliefsFilePath = path.join(userBeliefsDir, `${username}.json`);
  try {
    const data = await fs.readFile(userBeliefsFilePath, 'utf8');
    return JSON.parse(data) as UserBeliefs;
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      return {}; // Return an empty object if the file doesn't exist
    } else {
      throw err;
    }
  }
}

/**
 * Save user beliefs.
 * @param username - The username of the user.
 * @param data - The beliefs data to save.
 */
export async function saveUserBeliefs(username: string, data: UserBeliefs): Promise<void> {
  assertUsername(username);
  const userBeliefsFilePath = path.join(userBeliefsDir, `${username}.json`);
  await writeFileAtomic(userBeliefsFilePath, JSON.stringify(data, null, 2));
}

interface BeliefWithPreference {
  preference?: number;
  [key: string]: unknown;
}

/**
 * Toggle favorite status by adding or removing preference.
 * @param username - The username of the user.
 * @param beliefName - The name of the belief.
 * @returns True if now a favorite, false otherwise.
 */
export async function toggleUserFavorite(username: string, beliefName: string): Promise<boolean> {
  assertUsername(username);
  const userBeliefs = await getUserBeliefs(username);

  // Check if the user has more than 20 favorite beliefs
  const favoriteBeliefs = Object.values(userBeliefs).filter(
    (belief): belief is BeliefWithPreference => typeof (belief as BeliefWithPreference).preference === 'number'
  );

  if (
    favoriteBeliefs.length >= 20 &&
    typeof (userBeliefs[beliefName] as BeliefWithPreference | undefined)?.preference !== 'number'
  ) {
    throw new Error('You cannot have more than 20 core beliefs.');
  }

  if (!userBeliefs[beliefName]) {
    userBeliefs[beliefName] = {};
  }

  const belief = userBeliefs[beliefName] as BeliefWithPreference;
  if (typeof belief.preference === 'number') {
    // Remove preference
    delete belief.preference;
    await saveUserBeliefs(username, userBeliefs);
    return false; // Not a favorite anymore
  } else {
    // Add preference
    const points = calculateInitialPoints(userBeliefs);
    belief.preference = points;
    await saveUserBeliefs(username, userBeliefs);
    return true; // Now a favorite
  }
}

/**
 * Calculate initial points for a new favorite belief.
 * @param userBeliefs - The user's beliefs object.
 * @returns The calculated initial points.
 */
function calculateInitialPoints(userBeliefs: UserBeliefs): number {
  const preferences = Object.values(userBeliefs)
    .map((belief) => (belief as BeliefWithPreference).preference)
    .filter((preference): preference is number => typeof preference === 'number');

  if (preferences.length === 0) {
    return 10; // First favorite
  }
  const total = preferences.reduce((sum, val) => sum + val, 0);
  return Math.round(total / preferences.length); // Average of existing points
}

/**
 * Adjust preference points for a belief.
 * @param username - The username of the user.
 * @param beliefName - The name of the belief.
 * @param action - 'increase' or 'decrease'.
 * @returns The updated user beliefs.
 */
export async function adjustPieSlicePoints(username: string, beliefName: string, action: 'increase' | 'decrease'): Promise<UserBeliefs> {
  assertUsername(username);
  const userBeliefs = await getUserBeliefs(username);

  const coreBeliefs: string[] = [];
  Object.entries(userBeliefs).forEach(([belief, beliefData]) => {
    const pref = (beliefData as BeliefWithPreference).preference;
    if (typeof pref === 'number' && pref > 0) {
      coreBeliefs.push(belief);
    }
  });

  // Ensure the belief exists and has a preference
  const belief = userBeliefs[beliefName] as BeliefWithPreference | undefined;
  if (!belief || typeof belief.preference !== 'number') {
    throw new Error('Belief not found in favorites.');
  }

  // Increase or decrease the preference
  let points = belief.preference;
  points = Math.round(points * (action === 'increase' ? 1.1 : 0.9));

  // Update the belief's preference
  belief.preference = points;

  // Recalculate total preference sum
  const totalPreference = Object.values(userBeliefs)
    .filter((beliefData): beliefData is BeliefWithPreference => typeof (beliefData as BeliefWithPreference).preference === 'number')
    .reduce((sum, beliefData) => sum + (beliefData.preference ?? 0), 0);

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
    const coreBeliefData = userBeliefs[coreBelief] as BeliefWithPreference;
    if ((coreBeliefData.preference ?? 0) < minAllowedPreference) {
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
 * @param username - The username whose beliefs are being operated on
 * @param callback - Async function to execute in the queue
 * @returns The result of the callback
 */
export async function withUserBeliefs<T>(username: string, callback: () => Promise<T>): Promise<T> {
  if (!username) {
    throw new Error('Username is required for belief operations');
  }
  assertUsername(username);

  try {
    const result = await userBeliefsManager.executeInQueue(username, callback) as T;
    userBeliefsManager.cleanupQueue(username); // Clean up if queue is empty
    return result;
  } catch (error) {
    console.error(`Error in belief operation for user ${username}:`, error);
    throw error;
  }
}

/**
 * Get user settings.
 * @param username - The username of the user.
 * @returns The user's settings.
 */
export async function getUserSettings(username: string): Promise<UserSettings> {
  assertUsername(username);
  const settingsPath = path.join(userSettingsDir, `${username}.json`);
  try {
    const data = await fs.readFile(settingsPath, 'utf8');
    return { ...defaultSettings, ...JSON.parse(data) as UserSettings };
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      return { ...defaultSettings };
    }
    throw err;
  }
}

/**
 * Save user settings.
 * @param username - The username of the user.
 * @param settings - The settings to save.
 */
export async function saveUserSettings(username: string, settings: UserSettings): Promise<void> {
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
 * @param username - The username of the user.
 * @returns The user's bio text.
 */
export async function getUserBio(username: string): Promise<string> {
  assertUsername(username);
  const bioFilePath = path.join(userBiosDir, `${username}.md`);
  try {
    const data = await fs.readFile(bioFilePath, 'utf8');
    return data;
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      return ''; // Return empty string if file doesn't exist
    } else {
      throw err;
    }
  }
}

/**
 * Save user bio.
 * @param username - The username of the user.
 * @param bioText - The bio text to save.
 */
export async function saveUserBio(username: string, bioText: string): Promise<void> {
  assertUsername(username);
  if (bioText.length > 1500) {
    throw new Error('Bio cannot exceed 1500 characters.');
  }

  const dirPath = userBiosDir;
  try {
    await fs.access(dirPath);
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
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
 * @param username - The username of the user.
 */
export async function deleteUserAccount(username: string): Promise<void> {
  assertUsername(username);
  // Delete account file
  const userFilePath = path.join(userAccountsDir, `${username}.json`);
  await fs.unlink(userFilePath).catch((err) => {
    const error = err as { code?: string };
    if (error.code !== 'ENOENT') {
      throw err;
    }
  });

  // Delete beliefs file
  const userBeliefsFilePath = path.join(userBeliefsDir, `${username}.json`);
  await fs.unlink(userBeliefsFilePath).catch((err) => {
    const error = err as { code?: string };
    if (error.code !== 'ENOENT') {
      throw err;
    }
  });

  // Delete bio file
  const bioFilePath = path.join(userBiosDir, `${username}.md`);
  await fs.unlink(bioFilePath).catch((err) => {
    const error = err as { code?: string };
    if (error.code !== 'ENOENT') {
      throw err;
    }
  });

  // Delete settings file
  const userSettingsFilePath = path.join(userSettingsDir, `${username}.json`);
  await fs.unlink(userSettingsFilePath).catch((err) => {
    const error = err as { code?: string };
    if (error.code !== 'ENOENT') {
      throw err;
    }
  });
}

/**
 * Get a user's notifications
 * @param username - The username of the user
 * @returns Array of notification objects
 */
export async function getUserNotifications(username: string): Promise<Notification[]> {
  assertUsername(username);
  const notificationPath = path.join(notificationsDir, `${username}.json`);
  try {
    await fs.access(notificationPath);
    const data = await fs.readFile(notificationPath, 'utf8');
    return JSON.parse(data) as Notification[];
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
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
 * @param username - The username of the recipient
 * @param notification - The notification object to add
 */
export async function pushNotificationToUser(username: string, notification: Omit<Notification, 'timestamp'>): Promise<void> {
  assertUsername(username);
  const notificationPath = path.join(notificationsDir, `${username}.json`);
  try {
    await notificationQueue.add(async () => {
      const notifications = await getUserNotifications(username);
      notifications.unshift({
        ...notification,
        timestamp: Date.now()
      } as Notification);
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
 * @param username - The username whose followers should receive the notification
 * @param notification - The notification object to add
 */
export async function pushNotificationToFollowers(username: string, notification: Omit<Notification, 'timestamp'>): Promise<string[]> {
  assertUsername(username);
  try {
    const followers = await getUserFollowers(username);
    await Promise.all(followers.map(follower =>
      pushNotificationToUser(follower, notification)
    ));
    return followers;
  } catch (err) {
    console.error(`Failed to push notification to followers of ${username}:`, err);
    return [];
  }
}

/**
 * Get a user's followers
 * @param username - The username of the user
 * @returns Array of follower usernames
 */
export async function getUserFollowers(username: string): Promise<string[]> {
  assertUsername(username);
  const followersPath = path.join(followersDir, `${username}.json`);
  try {
    await fs.access(followersPath);
    const data = await fs.readFile(followersPath, 'utf8');
    return JSON.parse(data) as string[];
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
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
 * @param username - The username to get following list for
 * @returns List of usernames the user follows
 */
export async function getUserFollowing(username: string): Promise<string[]> {
  assertUsername(username);
  const followingPath = path.join(followsDir, `${username}.json`);
  try {
    const following = JSON.parse(await fs.readFile(followingPath, 'utf8')) as string[];
    return following;
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Update both follower and following relationships
 * @param targetUser - The user being followed
 * @param follower - The user who is following
 * @param isFollowing - True to follow, false to unfollow
 */
async function updateFollowRelationship(targetUser: string, follower: string, isFollowing: boolean): Promise<void> {
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
 * @param username - The username of the user to follow
 * @param followerUsername - The username of the follower
 */
export async function addFollower(username: string, followerUsername: string): Promise<void> {
  assertUsername(username);
  assertUsername(followerUsername);
  await updateFollowRelationship(username, followerUsername, true);
}

/**
 * Remove a follower from a user
 * @param username - The username of the user to unfollow
 * @param followerUsername - The username of the follower to remove
 */
export async function removeFollower(username: string, followerUsername: string): Promise<void> {
  assertUsername(username);
  assertUsername(followerUsername);
  await updateFollowRelationship(username, followerUsername, false);
}

interface FeedEntryWithTimestamp extends FeedEntry {
  timestamp: number;
  actor: string;
  type: string;
  beliefName?: string;
  old_choice?: string | null;
}

/**
 * Post a feed entry.
 * @param entry - The feed entry to post.
 */
export async function postFeed(entry: Omit<FeedEntry, 'timestamp'>): Promise<void> {
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
          (feedEntry: FeedEntryWithTimestamp) => feedEntry.actor !== entry.actor
            || feedEntry.type === entry.type
            || feedEntry.beliefName !== entry.beliefName
        );
      } else if (entry.type === 'choice_changed') {
        feed = feed.filter((feedEntry: FeedEntryWithTimestamp) => {
          if (feedEntry.actor !== entry.actor ||
              feedEntry.type !== 'choice_changed' ||
              feedEntry.beliefName !== entry.beliefName ||
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
          (entry as FeedEntryWithTimestamp).old_choice = feedEntry.old_choice || null;
          return false;
        });
      }

      const feedEntry: FeedEntryWithTimestamp = {
        ...entry,
        timestamp
      } as FeedEntryWithTimestamp;

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
 * @returns The feed entries.
 */
export async function getFeed(): Promise<FeedEntryWithTimestamp[]> {
  try {
    const feed = JSON.parse(await fs.readFile(FEED_FILE, 'utf8')) as FeedEntryWithTimestamp[];
    return feed;
  } catch (error) {
    console.error('Error reading feed file:', error);
    return [];
  }
}

