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
  waitForAutoSave,
  setAllowAllDebates
} from './testHelpers.js';
import { deleteUserAccount } from '../src/utils/userUtils.js';

test.describe('Reply Functionality', () => {
  let user2: { username: string; password: string };
  const beliefName = 'Absurdism';

  test.beforeEach(async () => {
    // Teardown and recreate users for isolation
    await teardownTestUser();
    await setupTestUser(); // This creates user1 (testUsername)
    
    // Delete user2 if it exists
    if (user2?.username) {
      try {
        await deleteUserAccount(user2.username);
      } catch (err) {
        // Ignore errors if user doesn't exist
      }
    }
    user2 = await createTestUser();
  });

  test.afterEach(async () => {
    // Clean up users after each test
    await teardownTestUser(); // This deletes user1
    if (user2?.username) {
      try {
        await deleteUserAccount(user2.username);
      } catch (err) {
        // Ignore errors if user doesn't exist
      }
    }
  });

  test('should not allow replies without debate me', async ({ page }) => {
    const commentText = 'Regular comment';

    // User 1 logs in and sets allowAllDebates to false
    await loginUser(page, testUsername, testPassword);
    await setAllowAllDebates(page, false);
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
    const user2Reply = 'User 2 reply';
    const reply1 = 'First reply';
    const reply2 = 'Second reply attempt';

    // User 1 adds comment with debate me
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // User 2 adds a reply first (profile owner needs at least one reply from another user)
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Wait for belief card and ensure it's visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    const toggleButton = page.locator('.toggle-replies');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    const replyInput = page.locator('.reply-input');
    await expect(replyInput).toBeVisible();
    await replyInput.fill(user2Reply);
    const replyButton = page.locator('.reply-button');
    await replyButton.click();
    await waitForAutoSave(page);
    await logoutUser(page);

    // Now user 1 (profile owner) can reply consecutively
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);

    // Wait for belief card and ensure it's visible
    const beliefCardUser1 = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCardUser1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    const toggleButtonUser1 = page.locator('.toggle-replies');
    await expect(toggleButtonUser1).toBeVisible();
    await toggleButtonUser1.click();

    const replyInputUser1 = page.locator('.reply-input');
    await expect(replyInputUser1).toBeVisible();
    await replyInputUser1.fill(reply1);
    const replyButtonUser1 = page.locator('.reply-button');
    await replyButtonUser1.click();
    await waitForAutoSave(page);

    // Try to add second reply (profile owner should be able to reply consecutively)
    await replyInputUser1.fill(reply2);
    await replyButtonUser1.click();
    await waitForAutoSave(page);

    // Verify second reply was added (profile owner can reply consecutively)
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

  test('should not show reply button for unauthenticated users', async ({ page }) => {
    const commentText = 'Comment for unauthenticated test debate me';

    // User 1 adds comment
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // Visit profile without logging in
    await goToProfile(page, testUsername);

    // Wait for the belief card to be visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify no reply button is visible (unauthenticated users cannot reply)
    const replyButton = beliefCard.locator('.toggle-replies');
    await expect(replyButton).not.toBeVisible();
  });

  test('should not allow profile owner to reply when no replies from others exist', async ({ page }) => {
    const commentText = 'Profile owner test comment debate me';

    // Profile owner adds comment
    await loginUser(page, testUsername, testPassword);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);

    // Wait for the belief card to be visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify no reply button is visible (profile owner needs replies from others first)
    const replyButton = beliefCard.locator('.toggle-replies');
    await expect(replyButton).not.toBeVisible();
  });

  test('should allow non-owner to reply when allowAllDebates is true', async ({ page }) => {
    const commentText = 'Regular comment without debate me';

    // User 1 logs in and sets allowAllDebates to true
    await loginUser(page, testUsername, testPassword);
    await setAllowAllDebates(page, true);
    await goToProfile(page, testUsername);
    await addBeliefComment(page, beliefName, commentText);
    await logoutUser(page);

    // Log in as user 2
    await loginUser(page, user2.username, user2.password);
    await goToProfile(page, testUsername);

    // Wait for the belief card to be visible
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify reply button is visible (allowAllDebates allows replies to any comment)
    const replyButton = beliefCard.locator('.toggle-replies');
    await expect(replyButton).toBeVisible();
  });

  test('should allow non-owner to reply again after another user replies', async ({ page }) => {
    const commentText = 'Testing reply after other user debate me';
    const user2Reply1 = 'User 2 first reply';
    const user2Reply2 = 'User 2 second reply attempt';
    const user3Reply = 'User 3 reply';

    // Create user 3
    const user3 = await createTestUser();

    try {
      // User 1 adds comment with debate me
      await loginUser(page, testUsername, testPassword);
      await goToProfile(page, testUsername);
      await addBeliefComment(page, beliefName, commentText);
      await logoutUser(page);

      // User 2 adds first reply
      await loginUser(page, user2.username, user2.password);
      await goToProfile(page, testUsername);

      const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
      await expect(beliefCard).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      const toggleButton = page.locator('.toggle-replies');
      await expect(toggleButton).toBeVisible();
      await toggleButton.click();

      const replyInput = page.locator('.reply-input');
      await expect(replyInput).toBeVisible();
      await replyInput.fill(user2Reply1);
      const replyButton = page.locator('.reply-button');
      await replyButton.click();
      await waitForAutoSave(page);
      await logoutUser(page);

      // User 3 adds a reply (breaks the consecutive reply chain)
      await loginUser(page, user3.username, user3.password);
      await goToProfile(page, testUsername);

      await expect(beliefCard).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      await expect(toggleButton).toBeVisible();
      await toggleButton.click();

      await expect(replyInput).toBeVisible();
      await replyInput.fill(user3Reply);
      await replyButton.click();
      await waitForAutoSave(page);
      await logoutUser(page);

      // Now user 2 should be able to reply again (last reply is not from them)
      await loginUser(page, user2.username, user2.password);
      await goToProfile(page, testUsername);

      await expect(beliefCard).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      await expect(toggleButton).toBeVisible();
      await toggleButton.click();

      await expect(replyInput).toBeVisible();
      await replyInput.fill(user2Reply2);
      await replyButton.click();
      await waitForAutoSave(page);

      // Verify second reply was added (user 2 can reply again after user 3 replied)
      const reply2Element = page.locator('.reply-display', { hasText: user2Reply2 });
      await expect(reply2Element).toBeVisible();
    } finally {
      // Clean up user 3
      try {
        await deleteUserAccount(user3.username);
      } catch (err) {
        // Ignore errors if user doesn't exist
      }
    }
  });
});

