// tests/editBio.spec.ts

import { test, expect } from '@playwright/test';
import { setupTestUser, teardownTestUser, testUsername, testPassword } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Edit User Bio', () => {
  test.beforeAll(async () => {
    await setupTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser();
  });

  test('Update bio with valid content', async ({ page }) => {
    const newBio = 'This is my new bio content.';

    // Log in
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Navigate to the profile page
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);

    // Wait for bio textarea to appear
    await page.waitForSelector('.user-bio-textarea');

    // Fill in the new bio
    await page.fill('.user-bio-textarea', newBio);

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Refresh the page to verify bio is saved
    await page.reload();

    // Verify that the bio is displayed correctly
    const bioContent = await page.inputValue('.user-bio-textarea');
    expect(bioContent).toBe(newBio);
  });
});

