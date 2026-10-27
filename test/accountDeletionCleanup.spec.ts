import { test, expect } from '@playwright/test';
import { deleteRecord, hasRecord, readRecord, writeRecord } from '../src/storage.js';
import path from 'path';
import {
  addFollower,
  deleteUserAccount,
  getFeed,
  getUserFollowers,
  getUserFollowing,
  postFeed,
} from '../src/utils/userUtils.js';
import { createTestUser } from './testHelpers.js';

test('account deletion removes related records, references, feed entries, and sessions', async () => {
  const deletedUser = await createTestUser();
  const otherUser = await createTestUser();
  const ownFiles = [
    path.join('data', 'notifications', `${deletedUser.username}.json`),
    path.join('data', 'followers', `${deletedUser.username}.json`),
    path.join('data', 'follows', `${deletedUser.username}.json`),
    path.join('data', 'bans', `${deletedUser.username}.json`),
  ];
  const sessionPath = path.join('sessions', `cleanup-${deletedUser.username}.json`);
  const otherBanPath = path.join('data', 'bans', `${otherUser.username}.json`);

  try {
    await addFollower(otherUser.username, deletedUser.username);
    await addFollower(deletedUser.username, otherUser.username);
    writeRecord(otherBanPath, JSON.stringify([{ username: deletedUser.username }]));
    writeRecord(sessionPath, JSON.stringify({
      passport: { user: deletedUser.username },
    }));
    await postFeed({
      actor: deletedUser.username,
      type: 'bio_updated',
    });

    await deleteUserAccount(deletedUser.username);

    for (const filePath of ownFiles) {
      expect(hasRecord(filePath)).toBe(false);
    }
    expect(await getUserFollowers(otherUser.username)).not.toContain(deletedUser.username);
    expect(await getUserFollowing(otherUser.username)).not.toContain(deletedUser.username);
    expect(JSON.parse(readRecord(otherBanPath))).not.toContainEqual({
      username: deletedUser.username,
    });
    expect(await getFeed()).not.toContainEqual(expect.objectContaining({
      actor: deletedUser.username,
    }));
    expect(hasRecord(sessionPath)).toBe(false);
  } finally {
    await deleteUserAccount(deletedUser.username);
    await deleteUserAccount(otherUser.username);
    if (hasRecord(sessionPath)) deleteRecord(sessionPath);
    if (hasRecord(otherBanPath)) deleteRecord(otherBanPath);
  }
});
