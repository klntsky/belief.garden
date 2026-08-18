import { test, expect } from '@playwright/test';
import {
  loginUser,
  setupTestUser,
  teardownTestUser,
  testPassword,
  testUsername,
} from './testHelpers.js';
import { getUserBeliefs, saveUserBeliefs } from '../src/utils/userUtils.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Pie chart action validation', () => {
  test.beforeAll(async () => {
    await setupTestUser();
    await saveUserBeliefs(testUsername, {
      Alpha: { preference: 50 },
      Beta: { preference: 50 },
    });
  });
  test.afterAll(teardownTestUser);

  test('rejects unknown preference actions without changing points', async ({ page }) => {
    await loginUser(page, testUsername, testPassword);
    const response = await page.request.post(
      `${SITE_DEPLOYMENT_PATH}/api/user-piechart/${testUsername}/Alpha/invalid`,
    );
    expect(response.status()).toBe(400);
    expect((await getUserBeliefs(testUsername)).Alpha?.preference).toBe(50);
  });
});
