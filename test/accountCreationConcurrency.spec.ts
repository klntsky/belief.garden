import { test, expect } from '@playwright/test';
import { addUser, deleteUserAccount } from '../src/utils/userUtils.js';

test('concurrent case-variant account creation allows only one user', async () => {
  const base = `raceuser_${Date.now()}`;
  const attempts = await Promise.allSettled([
    addUser({ username: base, passwordHash: 'hash' }),
    addUser({ username: base.toUpperCase(), passwordHash: 'hash' }),
  ]);

  try {
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
  } finally {
    await deleteUserAccount(base);
    await deleteUserAccount(base.toUpperCase());
  }
});
