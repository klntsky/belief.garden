import { test, expect } from '@playwright/test';
import { setupTestUser, teardownTestUser, testUsername, testPassword } from './testHelpers.js';
import { addUser, deleteUserAccount } from '../src/utils/userUtils.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

// Helper function to create a test user
async function createTestUser() {
  const username = `testuser_${Date.now()}`;
  const password = 'TestPassword123!';
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);
  await addUser({ username, passwordHash });
  return { username, password };
}

test.describe('Reply Functionality', () => {
  let user2;

  test.beforeAll(async () => {
    await setupTestUser(); // This creates user1 (testUsername)
    user2 = await createTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser(); // This deletes user1
    await deleteUserAccount(user2.username);
  });

  test('should not allow replies without debate me', async ({ page }) => {
    const beliefName = 'Budgeting';
    const commentText = 'asdasd';

    // User 1 logs in and adds comment
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Navigate to profile and add comment
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    const commentTextarea = beliefCard.locator('textarea.comment-input');
    await commentTextarea.fill(commentText);
    await page.waitForTimeout(1000);

    // Log out user 1
    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`);

    // Log in as user 2
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', user2.username);
    await page.fill('input[name="password"]', user2.password);
    await page.click('button[type="submit"]');

    // Go to user 1's profile
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    
    // Verify no reply button is visible
    const replyButton = page.locator('.toggle-replies');
    await expect(replyButton).not.toBeVisible();
  });

  test('should allow replies with debate me', async ({ page }) => {
    const beliefName = 'Budgeting';
    const commentText = 'asdasd debate me';
    const replyText = 'This is a reply';

    // User 1 logs in and adds comment
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Navigate to profile and add comment
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    const commentTextarea = beliefCard.locator('textarea.comment-input');
    await commentTextarea.fill(commentText);
    await page.waitForTimeout(1000);

    // Log out user 1
    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`);

    // Log in as user 2
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', user2.username);
    await page.fill('input[name="password"]', user2.password);
    await page.click('button[type="submit"]');

    // Go to user 1's profile
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    
    // Click reply button
    const replyButton = page.locator('.toggle-replies');
    await expect(replyButton).toBeVisible();
    await replyButton.click();

    // Add reply
    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill(replyText);
    await page.locator('.reply-button').click();

    // Verify reply is visible
    const replyDisplay = page.locator('.reply-display');
    await expect(replyDisplay).toBeVisible();
    await expect(replyDisplay).toContainText(replyText);
    await expect(replyDisplay).toContainText(user2.username);
  });
});
