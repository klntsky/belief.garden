import { test, expect } from '@playwright/test';
import { pushNotificationToUser } from '../src/utils/userUtils.js';
import {
  loginUser,
  setupTestUser,
  teardownTestUser,
  testPassword,
  testUsername,
} from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Notification links', () => {
  test.beforeAll(async () => {
    await setupTestUser();
    await pushNotificationToUser(testUsername, {
      actor: 'system',
      type: 'broadcast',
      message: 'Unsafe link test',
      url: 'https://example.invalid/phishing',
    });
  });

  test.afterAll(async () => {
    await teardownTestUser();
  });

  test('does not render external broadcast URLs', async ({ page }) => {
    await loginUser(page, testUsername, testPassword);
    const response = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=0`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toContainEqual(expect.objectContaining({
      message: 'Unsafe link test',
    }));
    await page.goto(`${SITE_DEPLOYMENT_PATH}/notifications`);

    const notification = page.locator('.notification-item').filter({
      hasText: 'Unsafe link test',
    });
    await expect(notification).toBeVisible();
    await expect(notification).toHaveAttribute('href', '/notifications');
  });
});
