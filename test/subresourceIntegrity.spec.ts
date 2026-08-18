import { test, expect } from '@playwright/test';
import {
  setupTestUser,
  teardownTestUser,
  testUsername,
} from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Third-party browser assets', () => {
  test.beforeAll(setupTestUser);
  test.afterAll(teardownTestUser);

  test('serves application dependencies from the same origin', async ({ page }) => {
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    const assets = page.locator(
      'script[src^="https://"]:not([src*="googletagmanager"]), link[rel="stylesheet"][href^="https://"]',
    );
    await expect(assets).toHaveCount(0);
  });
});
