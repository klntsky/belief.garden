// src/utils/adminUtils.js
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const adminsFilePath = path.join('data', 'admins.json');

/**
 * Get list of admin usernames
 * @returns {Promise<Array<string>>} - Array of admin usernames
 */
export async function getAdmins() {
  try {
    try {
      await fs.access(adminsFilePath);
    } catch {
      // File doesn't exist, initialize with klntsky
      const defaultAdmins = [{ username: 'klntsky' }];
      const dataDir = path.dirname(adminsFilePath);
      try {
        await fs.mkdir(dataDir, { recursive: true });
      } catch {
        // Directory might already exist
      }
      await fs.writeFile(adminsFilePath, JSON.stringify(defaultAdmins, null, 2), 'utf8');
      return ['klntsky'];
    }

    const data = await fs.readFile(adminsFilePath, 'utf8');
    const admins = JSON.parse(data);
    
    // Expect array of objects with username property
    if (Array.isArray(admins)) {
      return admins.map(admin => admin.username).filter(Boolean);
    }
    
    return [];
  } catch (error) {
    console.error('Error reading admins file:', error);
    // Return default admin if there's an error
    return ['klntsky'];
  }
}

/**
 * Check if a user is an admin
 * @param {string} username - The username to check
 * @returns {Promise<boolean>} - True if user is an admin
 */
export async function isAdmin(username) {
  const admins = await getAdmins();
  return admins.includes(username);
}

