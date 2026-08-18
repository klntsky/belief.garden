import { test, expect } from '@playwright/test';
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

test.describe('Follow validation', () => {
  test.beforeAll(setupTestUser);
  test.afterAll(teardownTestUser);

  test('cannot follow a user that does not exist', async ({ page }) => {
    await loginUser(page, testUsername, testPassword);
    const response = await page.request.put(
      `${SITE_DEPLOYMENT_PATH}/api/follow/missing_${Date.now()}`,
    );
    expect(response.status()).toBe(404);
  });
});
