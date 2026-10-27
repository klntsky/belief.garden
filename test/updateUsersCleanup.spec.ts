import { test, expect } from '@playwright/test';
import { deleteRecord, hasRecord } from '../src/storage.js';
import path from 'path';
import { createTestUser } from './testHelpers.js';
import { deleteUserAccount, saveUserBeliefs } from '../src/utils/userUtils.js';
import { updateUsersJson } from '../src/utils/updateUsers.js';

test('statistics update removes stale debate and comment cache records', async () => {
  const user = await createTestUser();
  const beliefName = `Cache Cleanup ${Date.now()}`;
  const debatePath = path.join('data', 'debates', `${beliefName}.json`);
  const commentPath = path.join('data', 'comments', `${beliefName}.json`);

  try {
    await saveUserBeliefs(user.username, {
      [beliefName]: { comment: 'debate me about this' },
    });
    updateUsersJson();
    expect(hasRecord(debatePath)).toBe(true);
    expect(hasRecord(commentPath)).toBe(true);

    await saveUserBeliefs(user.username, {});
    updateUsersJson();
    expect(hasRecord(debatePath)).toBe(false);
    expect(hasRecord(commentPath)).toBe(false);
  } finally {
    await deleteUserAccount(user.username);
    if (hasRecord(debatePath)) deleteRecord(debatePath);
    if (hasRecord(commentPath)) deleteRecord(commentPath);
  }
});
