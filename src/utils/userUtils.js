// src/utils/userUtils.js

import { promises as fs } from 'fs';
import path from 'path';

const userAccountsDir = path.join('data', 'accounts');
const userBeliefsDir = path.join('data', 'users');
const userBiosDir = path.join('data', 'bio');
const userSettingsDir = path.join('data', 'settings');

// Default settings for new users
const defaultSettings = {
  allowAllDebates: false,
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

/**
 * Get a user by their username.
 * @param {string} username - The username of the user.
 * @returns {Promise<Object|null>} - The user object or null if not found.
 */
export async function getUserByUsername(username) {
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
      await fs.writeFile(userFilePath, JSON.stringify(user, null, 2), 'utf8');
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
  const userFilePath = path.join(userAccountsDir, `${user.username}.json`);
  await fs.writeFile(userFilePath, JSON.stringify(user, null, 2), 'utf8');
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
  const userBeliefsFilePath = path.join(userBeliefsDir, `${username}.json`);
  await fs.writeFile(userBeliefsFilePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Toggle favorite status by adding or removing preference.
 * @param {string} username - The username of the user.
 * @param {string} beliefName - The name of the belief.
 * @returns {Promise<boolean>} - True if now a favorite, false otherwise.
 */
export async function toggleUserFavorite(username, beliefName) {
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
 * Get user settings.
 * @param {string} username - The username of the user.
 * @returns {Promise<Object>} - The user's settings.
 */
export async function getUserSettings(username) {
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
  const settingsPath = path.join(userSettingsDir, `${username}.json`);
  try {
    await fs.mkdir(userSettingsDir, { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
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
  await fs.writeFile(bioFilePath, bioText, 'utf8');
}

/**
 * Delete a user's account, including their account file, beliefs file, and bio.
 * @param {string} username - The username of the user.
 * @returns {Promise<void>}
 */
export async function deleteUserAccount(username) {
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
