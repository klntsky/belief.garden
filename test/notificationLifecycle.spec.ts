import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import { createTestUser, loginUser } from './testHelpers.js';
import { deleteUserAccount } from '../src/utils/userUtils.js';

const { SITE_DEPLOYMENT_PATH } = process.env;

test('notification polling excludes timestamps at or before since', async ({ page }) => {
  const user = await createTestUser();
  const since = 1700000000000;
  const notifications = [
    { type: 'broadcast', actor: 'system', message: 'Older notification', timestamp: since - 1 },
    { type: 'broadcast', actor: 'system', message: 'Boundary notification', timestamp: since },
    { type: 'broadcast', actor: 'system', message: 'Newer notification', timestamp: since + 1 },
  ];

  try {
    await fs.writeFile(`data/notifications/${user.username}.json`, JSON.stringify(notifications));
    await loginUser(page, user.username, user.password);
    const response = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=${since}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([notifications[2]]);
  } finally {
    await deleteUserAccount(user.username);
  }
});

test('marking notifications read persists across reload and later arrivals become unread', async ({ page }) => {
  const user = await createTestUser();
  const since = 1700000000000;
  const notifications = [
    { type: 'broadcast', actor: 'system', message: 'Already read', timestamp: since },
    { type: 'broadcast', actor: 'system', message: 'First unread', timestamp: since + 1 },
    { type: 'broadcast', actor: 'system', message: 'Latest unread', timestamp: since + 2 },
  ];

  try {
    await fs.writeFile(`data/notifications/${user.username}.json`, JSON.stringify(notifications));
    await loginUser(page, user.username, user.password);
    await page.evaluate(`localStorage.setItem('lastNotificationRead', '${since}')`);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/faq`);
    const counter = page.locator('.notification-counter');
    await expect(counter).toHaveText('2');
    await expect(counter).toBeVisible();
    await page.goto(`${SITE_DEPLOYMENT_PATH}/notifications`);
    const list = page.locator('#notifications-page-container');
    await expect(list.locator('.notification-item')).toHaveCount(2);
    await expect(list).not.toContainText('Already read');
    await list.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(list.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
    expect(await page.evaluate("localStorage.getItem('lastNotificationRead')")).toBe(String(since + 2));

    await page.reload();
    await expect(list.locator('.notifications-empty')).toHaveText('No new notifications');
    await page.goto(`${SITE_DEPLOYMENT_PATH}/faq`);
    await expect(page.locator('.notifications-list .notifications-empty')).toHaveText('No new notifications');
    await expect(counter).toBeHidden();

    const later = { type: 'broadcast', actor: 'system', message: 'Arrived after reading', timestamp: since + 3 };
    await fs.writeFile(`data/notifications/${user.username}.json`, JSON.stringify([...notifications, later]));
    const polling = page.waitForResponse(response => response.url().includes('/api/notifications?since=') && response.ok());
    await page.evaluate("window.dispatchEvent(new Event('focus'))");
    await polling;
    await expect(counter).toBeVisible();
    await expect(counter).toHaveText('1');
    await expect(page.locator('.notifications-list .notification-item')).toHaveText(/Arrived after reading/);
    expect(await page.evaluate("localStorage.getItem('lastNotificationRead')")).toBe(String(since + 2));
  } finally {
    await deleteUserAccount(user.username);
  }
});

test('the notification popup mark-read button clears the badge and persists the read timestamp', async ({ page }) => {
  const user = await createTestUser();
  const timestamp = 1700000000000;

  try {
    await fs.writeFile(`data/notifications/${user.username}.json`, JSON.stringify([
      { type: 'broadcast', actor: 'system', message: 'Unread popup notification', timestamp },
    ]));
    await loginUser(page, user.username, user.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/faq`);
    await expect(page.locator('.notification-counter')).toHaveText('1');
    await expect(page.locator('.notification-counter')).toBeVisible();
    await page.locator('.user-notifications-wrapper').hover();
    await page.locator('.notifications-popup').hover();
    await page.locator('.notifications-popup').getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.locator('.notification-counter')).toBeHidden();
    expect(await page.evaluate("localStorage.getItem('lastNotificationRead')")).toBe(String(timestamp));
  } finally {
    await deleteUserAccount(user.username);
  }
});
