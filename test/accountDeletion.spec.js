// tests/accountDeletion.spec.js

import { test, expect } from '@playwright/test';
import { addUser, deleteUserAccount } from '../src/utils/userUtils.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Account Deletion', () => {
  const testUsernameToDelete = `userToDelete${Date.now()}`;
  const testPasswordToDelete = 'DeleteMe123!';

  test.beforeAll(async () => {
    // Create the test user
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(testPasswordToDelete, saltRounds);
    await addUser({ username: testUsernameToDelete, passwordHash });
  });

  test.afterAll(async () => {
    // Ensure the user is deleted
    await deleteUserAccount(testUsernameToDelete);
  });

  test('Delete account with correct password', async ({ page }) => {
    // Log in
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsernameToDelete);
    await page.fill('input[name="password"]', testPasswordToDelete);
    await page.click('button[type="submit"]');

    // Navigate to the delete account page
    await page.goto(`${SITE_DEPLOYMENT_PATH}/delete`);

    // Confirm account deletion
    await page.fill('input[name="password"]', testPasswordToDelete);
    await page.click('button[type="submit"]');

    // Verify that the user is redirected to the home page
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/`);

    // Attempt to log in again
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsernameToDelete);
    await page.fill('input[name="password"]', testPasswordToDelete);
    await page.click('button[type="submit"]');

    // Verify that an error message is displayed
    await expect(page.locator('body')).toContainText('Incorrect username or password');
  });
});
