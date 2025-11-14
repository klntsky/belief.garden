// tests/addBeliefToFavorites.spec.ts

import { test, expect } from '@playwright/test';
import { setupTestUser, teardownTestUser, testUsername, testPassword } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

// function borrowed from the frontend
function toBoldUnicode(text: string): string {
  const boldUnicodeUpperStart = 0x1D400; // Unicode code point for 𝐀
  const boldUnicodeLowerStart = 0x1D41A; // Unicode code point for 𝐚

  return text.split('').map(char => {
    const code = char.charCodeAt(0);

    if (code >= 65 && code <= 90) { // A-Z
      return String.fromCodePoint(boldUnicodeUpperStart + (code - 65));
    } else if (code >= 97 && code <= 122) { // a-z
      return String.fromCodePoint(boldUnicodeLowerStart + (code - 97));
    } else {
      return char; // Non-alphabetic characters are unchanged
    }
  }).join('');
}


test.describe('Add Belief to Favorites', () => {
  test.beforeAll(async () => {
    await setupTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser();
  });

  test('Add a belief to core beliefs (favorites)', async ({ page }) => {
    const beliefName = 'Budgeting'; // Replace with an existing belief

    // Log in
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Navigate to the profile page
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);

    // Find the belief card
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible();

    // Click on the favorite star
    const favoriteStar = beliefCard.locator('.favorite-star');
    await favoriteStar.click();

    // Verify that the star is now active
    await expect(favoriteStar).toHaveClass(/active/);

    // Verify that the belief appears in the pie chart
    await page.waitForSelector('#pie-chart-container canvas');
    const pieChartData = await page.evaluate('chart.data.labels.join("")') as string;
    expect(pieChartData).toContain(toBoldUnicode(beliefName));
  });
});

