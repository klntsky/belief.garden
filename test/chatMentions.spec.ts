import { test, expect } from '@playwright/test';
import {
  deleteUserAccount,
  getFeed,
  getUserNotifications,
} from '../src/utils/userUtils.js';
import { createTestUser, loginUser } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test('chat notifies only explicitly @-mentioned users', async ({ page }) => {
  const users: { username: string; password: string }[] = [];
  try {
    const author = await createTestUser();
    users.push(author);
    const recipient = await createTestUser();
    users.push(recipient);
    await loginUser(page, author.username, author.password);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${author.username}`);
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/chat`, {
      data: { message: `hello ${recipient.username}` },
    });
    expect(response.status()).toBe(200);

    const notifications = await getUserNotifications(recipient.username);
    expect(notifications).not.toContainEqual(expect.objectContaining({
      type: 'mention',
      actor: author.username,
    }));
  } finally {
    for (const user of users) await deleteUserAccount(user.username);
  }
});

test('explicit mentions notify all three distinct users once even when a mention is repeated', async ({ page }) => {
  const users: { username: string; password: string }[] = [];
  try {
    const author = await createTestUser();
    users.push(author);
    const first = await createTestUser();
    users.push(first);
    const second = await createTestUser();
    users.push(second);
    const third = await createTestUser();
    users.push(third);
    const outsider = await createTestUser();
    users.push(outsider);
    await loginUser(page, author.username, author.password);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${author.username}`);
    const message = `@${first.username} @${first.username} @${second.username} @${third.username}`;
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/chat`, { data: { message } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    for (const recipient of [first, second, third]) {
      expect(await getUserNotifications(recipient.username)).toEqual([
        { type: 'mention', actor: author.username, message, timestamp: expect.any(Number) },
      ]);
    }
    expect(await getUserNotifications(author.username)).toEqual([]);
    expect(await getUserNotifications(outsider.username)).toEqual([]);
    const expectedFeed = [{ type: 'chat_message', actor: author.username, message, timestamp: expect.any(Number) }];
    expect((await getFeed()).filter(entry => entry.actor === author.username)).toEqual(expectedFeed);
    const feed = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/feed`);
    expect(feed.status()).toBe(200);
    expect((await feed.json()).filter((entry: { actor: string }) => entry.actor === author.username)).toEqual(expectedFeed);
  } finally {
    for (const user of users) await deleteUserAccount(user.username);
  }
});

test('more than three distinct mentions rejects the entire chat without notifications or a feed entry', async ({ page }) => {
  const users: { username: string; password: string }[] = [];
  try {
    const author = await createTestUser();
    users.push(author);
    const recipients: { username: string; password: string }[] = [];
    for (let index = 0; index < 4; index++) {
      const recipient = await createTestUser();
      users.push(recipient);
      recipients.push(recipient);
    }
    await loginUser(page, author.username, author.password);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${author.username}`);
    const message = recipients.map(recipient => `@${recipient.username}`).join(' ');
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/chat`, { data: { message } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'No more than 3 user mentions per message' });
    expect((await getFeed()).filter(entry => entry.actor === author.username)).toEqual([]);
    const feed = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/feed`);
    expect(feed.status()).toBe(200);
    expect((await feed.json()).filter((entry: { actor: string }) => entry.actor === author.username)).toEqual([]);
    for (const user of users) expect(await getUserNotifications(user.username)).toEqual([]);
  } finally {
    for (const user of users) await deleteUserAccount(user.username);
  }
});
