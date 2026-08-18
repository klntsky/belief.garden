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

  test('pins CDN dependencies with integrity metadata', async ({ page }) => {
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    const assets = page.locator(
      'script[src^="https://"]:not([src*="googletagmanager"]), link[rel="stylesheet"][href^="https://"]',
    );
    const count = await assets.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(assets.nth(i)).toHaveAttribute('integrity', /^sha384-/);
      await expect(assets.nth(i)).toHaveAttribute('crossorigin', 'anonymous');
    }
  });
});
