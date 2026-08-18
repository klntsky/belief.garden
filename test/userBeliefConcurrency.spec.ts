import { test, expect } from '@playwright/test';
import { createTestUser } from './testHelpers.js';
import {
  deleteUserAccount,
  getUserBeliefs,
  saveUserBeliefs,
  toggleUserFavorite,
  withUserBeliefs,
} from '../src/utils/userUtils.js';

test('favorite changes share the per-user belief queue', async () => {
  const user = await createTestUser();
  const favorite = `Favorite ${Date.now()}`;
  const commented = `Comment ${Date.now()}`;

  try {
    await saveUserBeliefs(user.username, { [favorite]: {}, [commented]: {} });
    await Promise.all([
      toggleUserFavorite(user.username, favorite),
      withUserBeliefs(user.username, async () => {
        const beliefs = await getUserBeliefs(user.username);
        beliefs[commented] = { comment: 'kept alongside the favorite' };
        await saveUserBeliefs(user.username, beliefs);
      }),
    ]);

    const beliefs = await getUserBeliefs(user.username);
    expect(beliefs[favorite]?.preference).toBe(10);
    expect(beliefs[commented]?.comment).toBe('kept alongside the favorite');
  } finally {
    await deleteUserAccount(user.username);
  }
});
