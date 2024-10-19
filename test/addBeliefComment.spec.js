// tests/addBeliefComment.spec.js

import { test, expect } from '@playwright/test';
import { setupTestUser, teardownTestUser, testUsername, testPassword } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Add Belief Comment', () => {
  test.beforeAll(async () => {
    await setupTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser();
  });

  test('Add a comment to a belief and verify visibility after logout', async ({ page }) => {
    const beliefName = 'Budgeting'; // Replace with an existing belief
    const commentText = 'I strongly support';

    // Log in
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Navigate to the profile page
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);

    // Find the belief card
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible();

    // Enter the comment
    const commentTextarea = beliefCard.locator('textarea.comment-input'); // Adjust selector as needed
    await commentTextarea.fill(commentText);

    // Wait for the comment to be saved (you may need to adjust this)
    await page.waitForTimeout(3000);

    // Log out
    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`);

    // Navigate to the user's profile as a guest
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);

    // Find the belief card again
    const beliefCardGuest = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCardGuest).toBeVisible();

    // Verify that the comment is visible
    const commentDisplayGuest = beliefCardGuest.locator('.comment-display'); // Adjust selector as needed
    await expect(commentDisplayGuest).toContainText(commentText);
  });
});
