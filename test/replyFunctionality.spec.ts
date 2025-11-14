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

test.describe('Reply Functionality', () => {
  let user2: { username: string; password: string };
  const beliefName = 'Absurdism';

  test.beforeAll(async () => {
    await setupTestUser(); // This creates user1 (testUsername)
    user2 = await createTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser(); // This deletes user1
    await deleteUserAccount(user2.username);
  });

  test('should not allow replies without debate me', async ({ page }) => {
    const commentText = 'Regular comment without debate me';

    // User 1 logs in and adds comment
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // Log in as user 2
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Wait for the belief card to be visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });

    // Wait for the page to settle after loading
    await page.waitForTimeout(1000);

    // Verify no reply button is visible within this specific belief card
    const replyButton = beliefCard.locator('.toggle-replies');
    await expect(replyButton).not.toBeVisible();
  });

  test('should allow replies with debate me', async ({ page }) => {
    const commentText = 'This is a comment with debate me phrase';
    const replyText = 'This is a reply';

    // User 1 logs in and adds comment
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // Log in as user 2
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Wait for the belief card to be visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible();

    // Click reply button and add reply
    const toggleButton = page.locator('.toggle-replies');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill(replyText);

    const replyButton = page.locator('.reply-button');
    await replyButton.click();
    await waitForAutoSave(page);

    // Verify reply is visible
    const replyElement = page.locator('.reply-display', { hasText: replyText });
    await expect(replyElement).toBeVisible();
  });

  test('should prevent consecutive replies from same user', async ({ page }) => {
    const commentText = 'Testing consecutive replies debate me';
    const reply1 = 'First reply';
    const reply2 = 'Second reply attempt';

    // User 1 adds comment with debate me
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // User 2 adds first reply
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Wait for belief card and ensure it's visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });

    // Wait for the page to settle after loading
    await page.waitForTimeout(1000);

    const toggleButton = page.locator('.toggle-replies');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill(reply1);
    const replyButton = page.locator('.reply-button');
    await replyButton.click();
    await waitForAutoSave(page);

    // Try to add second reply
    await replyInput.fill(reply2);
    await replyButton.click();
    await waitForAutoSave(page);

    // Verify second reply was not added
    const reply2Element = page.locator('.reply-display', { hasText: reply2 });
    await expect(reply2Element).not.toBeVisible();
  });

  test('should allow profile owner to reply consecutively', async ({ page }) => {
    const commentText = 'Testing consecutive replies debate me';
    const reply1 = 'First reply';
    const reply2 = 'Second reply attempt';

    // User 1 adds comment with debate me
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);

    // Wait for belief card and ensure it's visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });

    // Wait for the page to settle after loading
    await page.waitForTimeout(1000);

    const toggleButton = page.locator('.toggle-replies');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill(reply1);
    const replyButton = page.locator('.reply-button');
    await replyButton.click();
    await waitForAutoSave(page);

    // Try to add second reply
    await replyInput.fill(reply2);
    await replyButton.click();
    await waitForAutoSave(page);

    // Verify second reply was not added
    const reply2Element = page.locator('.reply-display', { hasText: reply2 });
    await expect(reply2Element).toBeVisible();
  });

  test('should allow reply deletion by owner', async ({ page }) => {
    const commentText = 'Testing reply deletion debate me';
    const replyText = 'Reply to be deleted';

    // User 1 adds comment
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // User 2 adds reply
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Wait for belief card and ensure it's visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check for the comment display first
    const commentDisplay = page.locator('.comment-display');
    await expect(commentDisplay).toBeVisible();

    // Now check for the toggle button
    const toggleButton = page.locator('.toggle-replies');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill(replyText);
    const replyButton = page.locator('.reply-button');
    await replyButton.click();
    await waitForAutoSave(page);

    // Wait for the reply to be added and find its delete button
    const replyElement = page.locator('.reply-display', { hasText: replyText });
    await expect(replyElement).toBeVisible();

    // Set up dialog handler before clicking delete
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Find and click the delete button
    const deleteButton = replyElement.locator('.delete-reply');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for the reply to be removed
    await expect(replyElement).not.toBeVisible({ timeout: 15000 });
  });

  test('should allow profile owner to delete user replies', async ({ page }) => {
    const commentText = 'Profile owner test debate me';
    const replyText = 'Reply to be deleted by profile owner';

    // Profile owner adds comment
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // User 2 adds reply
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Wait for belief card and ensure it's visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check for the comment display first
    const commentDisplay = beliefCard.locator('.comment-display');
    await expect(commentDisplay).toBeVisible();
    const usernameLabel = commentDisplay.locator('.username-label');
    await expect(usernameLabel).toHaveText(`${testUsername}: `);

    // Now check for the toggle button
    const toggleButton = page.locator('.toggle-replies');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill(replyText);
    const replyButton = page.locator('.reply-button');
    await replyButton.click();
    await waitForAutoSave(page);

    // Wait for the reply to be added
    const replyElement = page.locator('.reply-display', { hasText: replyText });
    await expect(replyElement).toBeVisible();
    await logoutUser(page);

    // Profile owner logs in to delete the reply
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);

    // Wait for belief card and toggle replies
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await toggleButton.click();

    // Set up dialog handler before clicking delete
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Find and click the delete button
    const deleteButton = replyElement.locator('.delete-reply');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for the reply to be removed
    await expect(replyElement).not.toBeVisible({ timeout: 15000 });
  });
});

