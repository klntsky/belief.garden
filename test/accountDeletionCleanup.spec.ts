import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
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

test('account deletion removes related files, references, feed entries, and sessions', async () => {
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
    await fs.mkdir(path.dirname(otherBanPath), { recursive: true });
    await fs.writeFile(otherBanPath, JSON.stringify([{ username: deletedUser.username }]));
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.writeFile(sessionPath, JSON.stringify({
      passport: { user: deletedUser.username },
    }));
    await postFeed({
      actor: deletedUser.username,
      type: 'bio_updated',
    });

    await deleteUserAccount(deletedUser.username);

    for (const filePath of ownFiles) {
      await expect(fs.access(filePath)).rejects.toThrow();
    }
    expect(await getUserFollowers(otherUser.username)).not.toContain(deletedUser.username);
    expect(await getUserFollowing(otherUser.username)).not.toContain(deletedUser.username);
    expect(JSON.parse(await fs.readFile(otherBanPath, 'utf8'))).not.toContainEqual({
      username: deletedUser.username,
    });
    expect(await getFeed()).not.toContainEqual(expect.objectContaining({
      actor: deletedUser.username,
    }));
    await expect(fs.access(sessionPath)).rejects.toThrow();
  } finally {
    await deleteUserAccount(deletedUser.username);
    await deleteUserAccount(otherUser.username);
    await fs.unlink(sessionPath).catch(() => undefined);
    await fs.unlink(otherBanPath).catch(() => undefined);
  }
});
