// tests/supportBelief.spec.js

import { test, expect } from '@playwright/test';
import { setupTestUser, teardownTestUser, testUsername, testPassword } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Support and Unsupport a Belief', () => {
  test.beforeAll(async () => {
    await setupTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser();
  });

  test('Support a belief, then undo and verify it is no longer present', async ({ page }) => {
    const beliefName = 'Budgeting'; // Replace with an existing belief

    // Log in
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Navigate to the profile page
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);

    {
      // Find the belief card
      const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
      await expect(beliefCard).toBeVisible();

      // Click on the support button
      const supportButton = beliefCard.locator('.support'); // Adjust selector as needed
      await supportButton.click();

      // Wait for the status to update
      await page.waitForTimeout(500);

      // Verify that the belief is marked as supported
      await expect(supportButton).toHaveClass(/selected/);
    }

    // Navigate to the profile page
    await page.reload();

    {
      // Find the belief card
      const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
      await expect(beliefCard).toBeVisible();

      // Click on the support button
      const supportButton = beliefCard.locator('.support.selected'); // Adjust selector as needed
      await supportButton.click();
      await page.waitForTimeout(1000);
    }

    // Navigate to the profile page
    await page.reload();

    {
      // Find the belief card
      const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
      await expect(beliefCard).toBeVisible();

      const supportButton2 = beliefCard.locator('.support'); // Adjust selector as needed
      // Wait for the status to update
      await expect(supportButton2).not.toHaveClass(/selected/);
    }
  });
});
