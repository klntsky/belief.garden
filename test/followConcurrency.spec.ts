import { test, expect } from '@playwright/test';
import { createTestUser } from './testHelpers.js';
import {
  addFollower,
  deleteUserAccount,
  getUserFollowers,
} from '../src/utils/userUtils.js';

test('concurrent follows do not overwrite each other', async () => {
  const target = await createTestUser();
  const first = await createTestUser();
  const second = await createTestUser();

  try {
    await Promise.all([
      addFollower(target.username, first.username),
      addFollower(target.username, second.username),
    ]);

    expect(await getUserFollowers(target.username)).toEqual(
      expect.arrayContaining([first.username, second.username]),
    );
  } finally {
    await deleteUserAccount(target.username);
    await deleteUserAccount(first.username);
    await deleteUserAccount(second.username);
  }
});
