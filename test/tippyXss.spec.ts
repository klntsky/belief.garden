import { test, expect } from '@playwright/test';
import {
  saveUserBeliefs,
} from '../src/utils/userUtils.js';
import {
  loginUser,
  setupTestUser,
  teardownTestUser,
  testPassword,
  testUsername,
} from './testHelpers.js';
import { readBeliefs, saveBeliefs } from '../src/readBeliefs.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;
const payload = '<img src=x onerror="globalThis.__tippyXss=true">';

test.describe('Belief tooltip rendering', () => {
  let category: string;
  let originalBeliefs: ReturnType<typeof readBeliefs>[string];

  test.beforeAll(async () => {
    await setupTestUser();
    const beliefsData = readBeliefs();
    category = Object.keys(beliefsData)[0]!;
    originalBeliefs = [...(beliefsData[category] || [])];
    beliefsData[category] = [
      ...originalBeliefs,
      { name: payload, description: 'Tooltip escaping test' },
    ];
    await saveBeliefs(beliefsData);
    await saveUserBeliefs(testUsername, {
      [payload]: { choice: 'support', comment: 'debate me' },
    });
  });

  test.afterAll(async () => {
    const beliefsData = readBeliefs();
    beliefsData[category] = originalBeliefs;
    await saveBeliefs(beliefsData);
    await teardownTestUser();
  });

  test('does not execute belief names in HTML-enabled tooltips', async ({ page }) => {
    await page.addInitScript(() => {
      (globalThis as { __tippyXss?: boolean }).__tippyXss = false;
    });
    await loginUser(page, testUsername, testPassword);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);

    await page.locator('.debatable-count').hover();
    await expect(page.locator('.tippy-box')).toBeVisible();
    await expect(page.locator('.tippy-box img')).toHaveCount(0);
    expect(await page.evaluate(() => (
      globalThis as { __tippyXss?: boolean }
    ).__tippyXss)).toBe(false);
  });
});
