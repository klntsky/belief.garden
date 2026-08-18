import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { createTestUser } from './testHelpers.js';
import { deleteUserAccount, saveUserBeliefs } from '../src/utils/userUtils.js';
import { updateUsersJson } from '../src/utils/updateUsers.js';

test('statistics update removes stale debate and comment cache files', async () => {
  const user = await createTestUser();
  const beliefName = `Cache Cleanup ${Date.now()}`;
  const debatePath = path.join('data', 'debates', `${beliefName}.json`);
  const commentPath = path.join('data', 'comments', `${beliefName}.json`);

  try {
    await saveUserBeliefs(user.username, {
      [beliefName]: { comment: 'debate me about this' },
    });
    updateUsersJson();
    await expect(fs.access(debatePath)).resolves.toBeUndefined();
    await expect(fs.access(commentPath)).resolves.toBeUndefined();

    await saveUserBeliefs(user.username, {});
    updateUsersJson();
    await expect(fs.access(debatePath)).rejects.toThrow();
    await expect(fs.access(commentPath)).rejects.toThrow();
  } finally {
    await deleteUserAccount(user.username);
    await fs.unlink(debatePath).catch(() => undefined);
    await fs.unlink(commentPath).catch(() => undefined);
  }
});
