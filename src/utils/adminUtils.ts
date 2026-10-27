// src/utils/adminUtils.ts
import { hasRecord, readRecord, writeRecord } from '../storage.js';
import path from 'path';

const adminsFilePath = path.join('data', 'admins.json');

interface Admin {
  username: string;
}

/**
 * Get list of admin usernames
 * @returns Array of admin usernames
 */
export async function getAdmins(): Promise<string[]> {
  try {
    if (!hasRecord(adminsFilePath)) {
      const defaultAdmins: Admin[] = [{ username: 'klntsky' }];
      writeRecord(adminsFilePath, JSON.stringify(defaultAdmins, null, 2));
      return ['klntsky'];
    }

    const data = readRecord(adminsFilePath);
    const admins = JSON.parse(data) as Admin[];
    
    // Expect array of objects with username property
    if (Array.isArray(admins)) {
      return admins.map(admin => admin.username).filter((username): username is string => Boolean(username));
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
 * @param username - The username to check
 * @returns True if user is an admin
 */
export async function isAdmin(username: string): Promise<boolean> {
  const admins = await getAdmins();
  return admins.includes(username);
}

