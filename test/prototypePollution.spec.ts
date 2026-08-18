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

test.describe('Belief key validation', () => {
  test.beforeAll(async () => {
    await setupTestUser();
  });

  test.afterAll(async () => {
    delete (Object.prototype as { choice?: string }).choice;
    await teardownTestUser();
  });

  test('rejects prototype keys without polluting Object.prototype', async ({ page }) => {
    await loginUser(page, testUsername, testPassword);

    const response = await page.request.put(
      `${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${testUsername}/__proto__`,
      { data: { choice: 'polluted' } },
    );

    expect(response.status()).toBe(400);
    expect(({} as { choice?: string }).choice).toBeUndefined();
  });
});
