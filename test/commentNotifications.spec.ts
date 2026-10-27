import { test, expect } from '@playwright/test';
import {
  deleteUserAccount,
  getFeed,
  getUserBeliefs,
  getUserNotifications,
  saveUserBeliefs,
} from '../src/utils/userUtils.js';
import { createTestUser, loginUser } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();
const { SITE_DEPLOYMENT_PATH } = process.env;

test('a new comment notifies followers with its payload but editing it does not notify again', async ({ page, browser }) => {
  const users: { username: string; password: string }[] = [];
  const followerContext = await browser.newContext();
  try {
    const author = await createTestUser();
    users.push(author);
    const follower = await createTestUser();
    users.push(follower);
    const outsider = await createTestUser();
    users.push(outsider);
    const beliefName = 'Absurdism';
    const nextBelief = 'Stoicism';
    const comment = 'A new comment for my followers';
    const editedComment = 'The edited comment should not notify again';
    const nextComment = 'A separate new comment';
    await saveUserBeliefs(author.username, {
      [beliefName]: { choice: 'support' },
      [nextBelief]: {},
    });
    await loginUser(page, author.username, author.password);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${author.username}`);
    const followerPage = await followerContext.newPage();
    await loginUser(followerPage, follower.username, follower.password);
    await expect(followerPage).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${follower.username}`);
    const follow = await followerPage.request.put(`${SITE_DEPLOYMENT_PATH}/api/follow/${author.username}`);
    expect(follow.status()).toBe(200);
    const authorNotifications = await getUserNotifications(author.username);
    const commentUrl = `${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${author.username}/${encodeURIComponent(beliefName)}`;

    const created = await page.request.put(commentUrl, { data: { comment } });
    expect(created.status()).toBe(200);
    const initialNotification = {
      type: 'new_comment',
      actor: author.username,
      beliefName,
      text: comment,
      timestamp: expect.any(Number),
    };
    await expect.poll(() => getUserNotifications(follower.username)).toEqual([initialNotification]);
    const delivered = await getUserNotifications(follower.username);
    const notifications = await followerPage.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(notifications.status()).toBe(200);
    expect(await notifications.json()).toEqual(delivered);
    expect(await getUserBeliefs(author.username)).toEqual({
      [beliefName]: { choice: 'support', comment, commentTime: expect.any(Number) },
      [nextBelief]: {},
    });

    const edited = await page.request.put(commentUrl, { data: { comment: editedComment } });
    expect(edited.status()).toBe(200);
    await expect.poll(async () => (await getFeed()).filter(entry =>
      entry.actor === author.username && entry.type === 'new_comment' && entry.text === editedComment,
    ).length).toBe(1);

    // A subsequent new-comment delivery drains earlier notification work before checking the edit.
    const nextCreated = await page.request.put(
      `${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${author.username}/${encodeURIComponent(nextBelief)}`,
      { data: { comment: nextComment } },
    );
    expect(nextCreated.status()).toBe(200);
    await expect.poll(() => getUserNotifications(follower.username)).toEqual([
      { type: 'new_comment', actor: author.username, beliefName: nextBelief, text: nextComment, timestamp: expect.any(Number) },
      ...delivered,
    ]);
    const afterEdit = await followerPage.request.get(`${SITE_DEPLOYMENT_PATH}/api/notifications`);
    expect(afterEdit.status()).toBe(200);
    expect(await afterEdit.json()).toEqual([
      { type: 'new_comment', actor: author.username, beliefName: nextBelief, text: nextComment, timestamp: expect.any(Number) },
      ...delivered,
    ]);
    const persisted = {
      [beliefName]: { choice: 'support', comment: editedComment, commentTime: expect.any(Number) },
      [nextBelief]: { comment: nextComment, commentTime: expect.any(Number) },
    };
    expect(await getUserBeliefs(author.username)).toEqual(persisted);
    const publicBeliefs = await followerPage.request.get(`${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${author.username}`);
    expect(publicBeliefs.status()).toBe(200);
    expect(await publicBeliefs.json()).toEqual(persisted);
    expect(await getUserNotifications(author.username)).toEqual(authorNotifications);
    expect(await getUserNotifications(outsider.username)).toEqual([]);
  } finally {
    await followerContext.close();
    for (const user of users) await deleteUserAccount(user.username);
  }
});
