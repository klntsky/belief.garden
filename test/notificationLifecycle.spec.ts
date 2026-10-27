import { test, expect } from '@playwright/test';
import { writeRecord } from '../src/storage.js';
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
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify(notifications));
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
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify(notifications));
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
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify([...notifications, later]));
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
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify([
      { type: 'broadcast', actor: 'system', message: 'Unread popup notification', timestamp },
    ]));
    await page.goto(`${SITE_DEPLOYMENT_PATH}/`);
    await page.evaluate(() => localStorage.setItem('lastNotificationRead', '0'));
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

test('a cursorless client initializes once at the latest notification and retains later unread arrivals', async ({ page }) => {
  const user = await createTestUser();
  const timestamp = 1700000000000;
  const existing = [
    { type: 'broadcast', actor: 'system', message: 'Latest existing', timestamp: timestamp + 2 },
    { type: 'broadcast', actor: 'system', message: 'Oldest existing', timestamp },
    { type: 'broadcast', actor: 'system', message: 'Middle existing', timestamp: timestamp + 1 },
  ];
  try {
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify(existing));
    const login = await page.request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
      form: { username: user.username, password: user.password },
    });
    expect(login.ok()).toBe(true);
    const initial = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(await initial.json()).toEqual([]);
    expect(initial.headers()['x-notification-read-cursor']).toBe(String(timestamp + 2));
    const later = { type: 'broadcast', actor: 'system', message: 'Arrived after initialization', timestamp: timestamp + 3 };
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify([...existing, later]));
    const next = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(await next.json()).toEqual([later]);
    expect(next.headers()['x-notification-read-cursor']).toBe(String(timestamp + 2));
  } finally {
    await deleteUserAccount(user.username);
  }
});

test('legacy cursors remain authoritative, including zero, while the server only advances', async ({ page }) => {
  const user = await createTestUser();
  const timestamp = 1700000000000;
  const notifications = [0, 1, 2].map(offset => ({
    type: 'broadcast', actor: 'system', message: `Notification ${offset}`, timestamp: timestamp + offset,
  }));
  try {
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify(notifications));
    await page.request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
      form: { username: user.username, password: user.password },
    });
    const first = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=0`);
    expect(await first.json()).toEqual(notifications);
    const fallback = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(fallback.headers()['x-notification-read-cursor']).toBe('0');
    expect(await fallback.json()).toEqual(notifications);

    await Promise.all([timestamp + 1, timestamp, 0].map(since =>
      page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=${since}`),
    ));
    const staleClient = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=${timestamp}`);
    expect(await staleClient.json()).toEqual(notifications.slice(1));
    const freshClient = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(freshClient.headers()['x-notification-read-cursor']).toBe(String(timestamp + 1));
    expect(await freshClient.json()).toEqual([notifications[2]]);
  } finally {
    await deleteUserAccount(user.username);
  }
});

test('mark-read acknowledges only the displayed cursor and cannot hide a concurrent arrival or regress', async ({ page }) => {
  const user = await createTestUser();
  const timestamp = 1700000000000;
  const displayed = { type: 'broadcast', actor: 'system', message: 'Displayed', timestamp };
  const arriving = { type: 'broadcast', actor: 'system', message: 'Concurrent arrival', timestamp: timestamp + 1 };
  try {
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify([displayed]));
    await page.request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
      form: { username: user.username, password: user.password },
    });
    const shown = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=0`);
    expect(await shown.json()).toEqual([displayed]);
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify([displayed, arriving]));
    const marked = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/notifications/read`, { data: { timestamp } });
    expect(marked.status()).toBe(204);
    const older = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/notifications/read`, { data: { timestamp: 0 } });
    expect(older.status()).toBe(204);
    const freshClient = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(await freshClient.json()).toEqual([arriving]);
    expect(freshClient.headers()['x-notification-read-cursor']).toBe(String(timestamp));
  } finally {
    await deleteUserAccount(user.username);
  }
});

test('invalid or cross-site polling cannot poison the account cursor', async ({ page }) => {
  const user = await createTestUser();
  const timestamp = 1700000000000;
  try {
    writeRecord(`data/notifications/${user.username}.json`, JSON.stringify([
      { type: 'broadcast', actor: 'system', message: 'Latest', timestamp },
    ]));
    await page.request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
      form: { username: user.username, password: user.password },
    });
    for (const since of ['bad', '-1', '1.5', 'Infinity', '9007199254740992']) {
      const invalid = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=${since}`);
      expect(invalid.status()).toBe(400);
    }
    const crossSite = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications?since=${timestamp + 1}`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(crossSite.status()).toBe(403);
    const invalidMark = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/notifications/read`, { data: { timestamp: -1 } });
    expect(invalidMark.status()).toBe(400);
    const freshClient = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(freshClient.headers()['x-notification-read-cursor']).toBe(String(timestamp));
    expect(await freshClient.json()).toEqual([]);
  } finally {
    await deleteUserAccount(user.username);
  }
});
