// tests/testHelpers.ts

import { test, expect, type Page } from '@playwright/test';
import { addUser, deleteUserAccount } from '../src/utils/userUtils.js';
import { getAdmins } from '../src/utils/adminUtils.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

export const testUsername = 'testuser';
export const testPassword = 'TestPassword123!';

export async function setupTestUser(): Promise<void> {
  // Delete the test user if it exists
  try {
    await deleteUserAccount(testUsername);
  } catch (err) {
    console.error('Error deleting test user:', err);
  }

  // Create the test user
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(testPassword, saltRounds);
  await addUser({ username: testUsername, passwordHash });
}

export async function teardownTestUser(): Promise<void> {
  // Delete the test user
  try {
    await deleteUserAccount(testUsername);
  } catch (err) {
    console.error('Error deleting test user:', err);
  }
}

// Helper function to create a test user with random username
export async function createTestUser(): Promise<{ username: string; password: string }> {
  const username = `testuser_${Date.now()}`;
  const password = 'TestPassword123!';
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);
  await addUser({ username, passwordHash });
  return { username, password };
}

// Helper function to log in a user
export async function loginUser(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

// Helper function to log out a user
export async function logoutUser(page: Page): Promise<void> {
  await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`);
}

// Helper function to navigate to a user's profile
export async function goToProfile(page: Page, username: string): Promise<void> {
  await page.goto(`${SITE_DEPLOYMENT_PATH}/${username}`);
}

// Helper function to add a comment to a belief
export async function addBeliefComment(page: Page, beliefName: string, commentText: string): Promise<void> {
  const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
  await expect(beliefCard).toBeVisible();
  const commentTextarea = beliefCard.locator('textarea.comment-input');
  await commentTextarea.fill(commentText);
  // Wait for auto-save
  await waitForAutoSave(page);
}

// Helper function to wait for auto-save
export async function waitForAutoSave(page: Page, duration = 1500): Promise<void> {
  await page.waitForTimeout(duration);
}

// Helper function to set allowAllDebates setting for a user
export async function setAllowAllDebates(page: Page, allowAllDebates: boolean): Promise<void> {
  const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/settings`, {
    data: {
      allowAllDebates
    }
  });
  
  if (!response.ok()) {
    throw new Error(`Failed to set allowAllDebates: ${response.status()} ${await response.text()}`);
  }
}

// Admin management functions for testing
const adminsFilePath = path.join('data', 'admins.json');

interface Admin {
  username: string;
}

/**
 * Set the list of admin usernames (for testing purposes)
 * @param usernames - Array of usernames to set as admins
 */
async function setAdmins(usernames: string[]): Promise<void> {
  const adminList: Admin[] = usernames.map(username => ({ username }));
  await fs.writeFile(adminsFilePath, JSON.stringify(adminList, null, 2), 'utf8');
}

/**
 * Add a user as an admin (for testing purposes)
 * @param username - The username to add as admin
 */
export async function addAdmin(username: string): Promise<void> {
  const admins = await getAdmins();
  if (!admins.includes(username)) {
    await setAdmins([...admins, username]);
  }
}

/**
 * Remove a user from admins (for testing purposes)
 * @param username - The username to remove from admins
 */
export async function removeAdmin(username: string): Promise<void> {
  const admins = await getAdmins();
  if (admins.includes(username)) {
    await setAdmins(admins.filter(u => u !== username));
  }
}

// Helper function for common test setup
export function setupCommonTest(description: string): void {
  test.describe(description, () => {
    test.beforeAll(async () => {
      await setupTestUser();
    });

    test.afterAll(async () => {
      await teardownTestUser();
    });
  });
}

