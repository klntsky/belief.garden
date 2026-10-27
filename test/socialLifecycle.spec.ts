import { test, expect } from '@playwright/test';
import {
  deleteUserAccount,
  getUserBeliefs,
  getUserFollowers,
  getUserFollowing,
  getUserNotifications,
  saveUserBeliefs,
} from '../src/utils/userUtils.js';
import { createTestUser, loginUser } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();
const { SITE_DEPLOYMENT_PATH } = process.env;

test('follow and unfollow are idempotent in persisted relationships and notifications', async ({ page }) => {
  const users: { username: string; password: string }[] = [];
  try {
    const follower = await createTestUser();
    users.push(follower);
    const target = await createTestUser();
    users.push(target);
    await loginUser(page, follower.username, follower.password);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${follower.username}`);
    const followUrl = `${SITE_DEPLOYMENT_PATH}/api/follow/${target.username}`;

    const assertRelationship = async (following: boolean) => {
      const status = await page.request.get(followUrl);
      expect(status.status()).toBe(200);
      expect(await status.json()).toBe(following);
      const list = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/following`);
      expect(list.status()).toBe(200);
      expect(await list.json()).toEqual({ following: following ? [target.username] : [] });
      expect(await getUserFollowing(follower.username)).toEqual(following ? [target.username] : []);
      expect(await getUserFollowers(target.username)).toEqual(following ? [follower.username] : []);
    };

    await assertRelationship(false);
    expect((await page.request.put(followUrl)).status()).toBe(200);
    await assertRelationship(true);
    const followedNotifications = await getUserNotifications(target.username);
    expect(followedNotifications).toEqual([
      { type: 'new_follower', actor: follower.username, timestamp: expect.any(Number) },
    ]);
    expect((await page.request.put(followUrl)).status()).toBe(200);
    await assertRelationship(true);
    expect(await getUserNotifications(target.username)).toEqual(followedNotifications);

    expect((await page.request.delete(followUrl)).status()).toBe(200);
    await assertRelationship(false);
    const unfollowedNotifications = await getUserNotifications(target.username);
    expect(unfollowedNotifications).toEqual([
      { type: 'unfollowed', actor: follower.username, timestamp: expect.any(Number) },
      ...followedNotifications,
    ]);
    expect((await page.request.delete(followUrl)).status()).toBe(200);
    await assertRelationship(false);
    expect(await getUserNotifications(target.username)).toEqual(unfollowedNotifications);
    expect(await getUserNotifications(follower.username)).toEqual([]);
  } finally {
    for (const user of users) await deleteUserAccount(user.username);
  }
});

test('banning with deleteReplies removes only the target replies across the profile and unban restores replies', async ({ page, browser }) => {
  const users: { username: string; password: string }[] = [];
  const targetContext = await browser.newContext();
  try {
    const owner = await createTestUser();
    users.push(owner);
    const target = await createTestUser();
    users.push(target);
    const other = await createTestUser();
    users.push(other);
    const first = 'Absurdism';
    const second = 'Stoicism';
    const untouched = 'Agnosticism';
    const targetReply = { username: target.username, comment: 'Target reply', timestamp: 1 };
    const otherReply = { username: other.username, comment: 'Other reply', timestamp: 2 };
    const ownerReply = { username: owner.username, comment: 'Owner reply', timestamp: 3 };
    const original = {
      [first]: { choice: 'support', comment: 'First comment: debate me', replies: [targetReply, otherReply, { ...targetReply, timestamp: 4 }] },
      [second]: { comment: 'Second comment: debate me', replies: [{ ...targetReply, timestamp: 5 }, ownerReply, { ...otherReply, timestamp: 6 }] },
      [untouched]: { comment: 'Untouched comment', replies: [{ ...otherReply, timestamp: 7 }] },
    };
    const outsideProfile = { [first]: { comment: 'Another profile: debate me', replies: [targetReply] } };
    await saveUserBeliefs(owner.username, original);
    await saveUserBeliefs(other.username, outsideProfile);
    await loginUser(page, owner.username, owner.password);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${owner.username}`);
    const targetPage = await targetContext.newPage();
    await loginUser(targetPage, target.username, target.password);
    await expect(targetPage).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${target.username}`);

    const ban = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/ban-user`, {
      data: { bannedUser: target.username, deleteReplies: true },
    });
    expect(ban.status()).toBe(200);
    const bans = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/bans`);
    expect(bans.status()).toBe(200);
    expect(await bans.json()).toEqual([{ username: target.username }]);
    const remaining = {
      [first]: { ...original[first], replies: [otherReply] },
      [second]: { ...original[second], replies: [ownerReply, { ...otherReply, timestamp: 6 }] },
      [untouched]: original[untouched],
    };
    const beliefsUrl = `${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${owner.username}`;
    const afterBan = await page.request.get(beliefsUrl);
    expect(afterBan.status()).toBe(200);
    expect(await afterBan.json()).toEqual(remaining);
    expect(await getUserBeliefs(owner.username)).toEqual(remaining);
    expect(await getUserBeliefs(other.username)).toEqual(outsideProfile);
    const notificationsBeforeRejection = await getUserNotifications(owner.username);

    const replyUrl = `${beliefsUrl}/${encodeURIComponent(first)}/reply`;
    const blocked = await targetPage.request.post(replyUrl, { data: { comment: 'Blocked reply' } });
    expect(blocked.status()).toBe(403);
    expect(await blocked.json()).toEqual({ error: 'You are banned from replying to this profile' });
    expect(await getUserBeliefs(owner.username)).toEqual(remaining);
    expect(await getUserNotifications(owner.username)).toEqual(notificationsBeforeRejection);

    const unban = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/unban-user`, {
      data: { bannedUser: target.username },
    });
    expect(unban.status()).toBe(200);
    const afterUnban = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/bans`);
    expect(afterUnban.status()).toBe(200);
    expect(await afterUnban.json()).toEqual([]);
    const restored = await targetPage.request.post(replyUrl, { data: { comment: 'Reply after unban' } });
    expect(restored.status()).toBe(200);
    const restoredReply = await restored.json();
    expect(restoredReply).toEqual({ username: target.username, comment: 'Reply after unban', timestamp: expect.any(Number) });
    const expectedRestored = {
      ...remaining,
      [first]: { ...remaining[first], replies: [otherReply, restoredReply] },
    };
    const restoredBeliefs = await page.request.get(beliefsUrl);
    expect(restoredBeliefs.status()).toBe(200);
    expect(await restoredBeliefs.json()).toEqual(expectedRestored);
    expect(await getUserBeliefs(owner.username)).toEqual(expectedRestored);
    expect(await getUserBeliefs(other.username)).toEqual(outsideProfile);
    expect(await getUserNotifications(owner.username)).toEqual([
      { type: 'new_reply', actor: target.username, profileName: owner.username, beliefName: first, timestamp: expect.any(Number) },
      ...notificationsBeforeRejection,
    ]);
  } finally {
    await targetContext.close();
    for (const user of users) await deleteUserAccount(user.username);
  }
});
