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

test.describe('CSRF protection', () => {
  test.beforeAll(setupTestUser);
  test.afterAll(teardownTestUser);

  test('rejects state-changing requests from another origin', async ({ page }) => {
    await loginUser(page, testUsername, testPassword);
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/settings`, {
      headers: { Origin: 'https://attacker.invalid' },
      data: { allowAllDebates: false },
    });
    expect(response.status()).toBe(403);
  });
});
