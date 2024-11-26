// tests/testHelpers.js

import { test, expect } from '@playwright/test';
import { addUser, deleteUserAccount } from '../src/utils/userUtils.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

export const testUsername = 'testuser';
export const testPassword = 'TestPassword123!';

export async function setupTestUser() {
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

export async function teardownTestUser() {
  // Delete the test user
  try {
    await deleteUserAccount(testUsername);
  } catch (err) {
    console.error('Error deleting test user:', err);
  }
}

// Helper function to create a test user with random username
export async function createTestUser() {
  const username = `testuser_${Date.now()}`;
  const password = 'TestPassword123!';
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);
  await addUser({ username, passwordHash });
  return { username, password };
}

// Helper function to log in a user
export async function loginUser(page, username, password) {
  await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

// Helper function to log out a user
export async function logoutUser(page) {
  await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`);
}

// Helper function to navigate to a user's profile
export async function goToProfile(page, username) {
  await page.goto(`${SITE_DEPLOYMENT_PATH}/${username}`);
}

// Helper function to add a comment to a belief
export async function addBeliefComment(page, beliefName, commentText) {
  const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
  await expect(beliefCard).toBeVisible();
  const commentTextarea = beliefCard.locator('textarea.comment-input');
  await commentTextarea.fill(commentText);
  // Wait for auto-save
  await waitForAutoSave(page);
}

// Helper function to wait for auto-save
export async function waitForAutoSave(page, duration = 1000) {
  await page.waitForTimeout(duration);
}

// Helper function for common test setup
export function setupCommonTest(description) {
  test.describe(description, () => {
    test.beforeAll(async () => {
      await setupTestUser();
    });

    test.afterAll(async () => {
      await teardownTestUser();
    });

    return test;
  });
}
