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

test.describe('Settings validation', () => {
  test.beforeAll(setupTestUser);
  test.afterAll(teardownTestUser);

  test('persists only supported settings fields', async ({ page }) => {
    await loginUser(page, testUsername, testPassword);
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/settings`, {
      data: {
        allowAllDebates: false,
        isAdmin: true,
        arbitrary: 'value',
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ allowAllDebates: false });
  });
});
