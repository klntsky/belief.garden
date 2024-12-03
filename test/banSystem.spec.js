import { test, expect } from '@playwright/test';
import {
  setupTestUser,
  teardownTestUser,
  testUsername,
  testPassword,
  createTestUser,
  loginUser,
  logoutUser,
  goToProfile,
  addBeliefComment,
  waitForAutoSave
} from './testHelpers.js';
import { deleteUserAccount } from '../src/utils/userUtils.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
const { SITE_DEPLOYMENT_PATH } = process.env;

// Function to clear bans for a user
async function clearBans(userId) {
  const banFilePath = path.join('data', 'bans', `${userId}.json`);
  try {
    await fs.unlink(banFilePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

test.describe('Ban System', () => {
  let user2;
  const beliefName = 'Absurdism';
  const commentText = 'Test ban functionality debate me';
  const replyText = 'Reply that will get user banned';

  // Increase timeout to 60s
  test.setTimeout(60000);

  test.beforeAll(async () => {
    await setupTestUser(); // Creates user1 (testUsername)
    user2 = await createTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser(); // Deletes user1
    await deleteUserAccount(user2.username);

    // Clear bans for both users after each test
    await clearBans(testUsername);
    await clearBans(user2.username);

    // Clean up any ban files
    try {
      await fs.unlink(path.join('data', 'bans', `${testUsername}.json`));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  });

  test('should show ban link for profile owner', async ({ page }) => {
    // Profile owner adds comment and user2 replies
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Add reply
    let beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await beliefCard.locator('.toggle-replies').click();
    await page.fill('.reply-input', replyText);
    await page.click('.reply-button');
    await waitForAutoSave(page);
    await logoutUser(page);

    // Check ban link as profile owner
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await beliefCard.locator(`.toggle-replies`).click();

    // Need to hover over the reply to see the ban link
    const reply = page.locator('.reply-display').filter({ hasText: replyText });
    await reply.hover();

    const banLink = beliefCard.locator('.ban-link');
    await expect(banLink).toBeVisible();
    await expect(banLink).toHaveAttribute('href', `/settings?ban=${user2.username}`);
  });

  test('should not show ban link for non-owner', async ({ page }) => {
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);
    let beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await beliefCard.locator('.toggle-replies').click();

    // Even on hover, non-owner shouldn't see ban link
    const reply = page.locator('.reply-display').filter({ hasText: replyText });
    await reply.hover();

    const banLink = beliefCard.locator('.ban-link');
    await expect(banLink).not.toBeVisible();
  });

  test('should ban user and prevent replies', async ({ page }) => {
    // Profile owner bans user2
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);

    // Wait for belief card and ensure it's visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Show replies and find the ban link
    const toggleButton = beliefCard.locator('.toggle-replies');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    const replyElement = page.locator('.reply-display', { hasText: replyText });
    await expect(replyElement).toBeVisible();
    await replyElement.hover();

    const banLink = page.locator('.ban-link');
    await expect(banLink).toBeVisible();
    await banLink.click();

    // On ban page
    await expect(page).toHaveURL(new RegExp(`${SITE_DEPLOYMENT_PATH}/settings`));
    await expect(page.locator('#username')).toHaveValue(user2.username);
    await page.locator('#banForm button[type="submit"]').click();

    // Wait for ban to be saved
    const banItem = page.locator('.ban-item', { hasText: user2.username });
    await expect(banItem).toBeVisible();
    await logoutUser(page);

    // Verify banned user can't reply
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Try to add a reply
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await toggleButton.click();

    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill('This reply should fail');

    const replyButton = page.locator('.reply-button');
    await replyButton.click();

    // Wait for error response
    const response = await page.waitForResponse(response =>
      response.url().includes('/api/user-beliefs') && !response.ok()
    );
    const errorData = await response.json();
    expect(errorData.error).toContain('banned from replying');
  });
});
