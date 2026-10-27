import { test, expect } from '@playwright/test';
import { createTestUser, loginUser } from './testHelpers.js';
import { deleteUserAccount, saveUserBeliefs } from '../src/utils/userUtils.js';

const { SITE_DEPLOYMENT_PATH } = process.env;
const beliefs = ['Existentialism', 'Absurdism', 'Nihilism', 'Stoicism', 'Hedonism'];
const varied = ['support', 'neutral', 'reject', 'support', 'reject'];

for (const scenario of [
  { name: 'identical', viewer: varied, other: varied, expected: 'Belief correlation with you: 100%' },
  { name: 'opposite', viewer: varied, other: ['reject', 'neutral', 'support', 'reject', 'support'], expected: 'Belief correlation with you: -100%' },
  { name: 'only four shared', viewer: varied, other: varied.slice(0, 4), expected: 'Not enough shared beliefs' },
  { name: 'constant', viewer: ['support', 'support', 'support', 'support', 'support'], other: varied, expected: 'Belief correlation with you: 0%' },
]) {
  test(`profile correlation displays ${scenario.name} choices correctly`, async ({ page }) => {
    const viewer = await createTestUser();
    const other = await createTestUser();

    try {
      await saveUserBeliefs(viewer.username, Object.fromEntries(scenario.viewer.map((choice, i) => [beliefs[i]!, { choice }])));
      await saveUserBeliefs(other.username, Object.fromEntries(scenario.other.map((choice, i) => [beliefs[i]!, { choice }])));
      await loginUser(page, viewer.username, viewer.password);
      await page.goto(`${SITE_DEPLOYMENT_PATH}/${other.username}`);
      await expect(page.locator('#correlation-container')).toContainText(scenario.expected);
      await expect(page.locator('#correlation-container')).not.toContainText('NaN');
      await expect(page.locator('#correlation-container')).not.toContainText('Infinity');
    } finally {
      await deleteUserAccount(viewer.username);
      await deleteUserAccount(other.username);
    }
  });
}
