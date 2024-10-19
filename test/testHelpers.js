// tests/testHelpers.js

import { addUser, deleteUserAccount } from '../src/utils/userUtils.js';
import bcrypt from 'bcrypt';

export const testUsername = 'testuser';
export const testPassword = 'TestPassword123!';

export async function setupTestUser() {
  // Delete the test user if it exists
  try {
    await deleteUserAccount(testUsername);
  } catch (err) {
    console.error('Error deleting test user:', err);
  }

  // Create the test user
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(testPassword, saltRounds);
  await addUser({ username: testUsername, passwordHash });
}

export async function teardownTestUser() {
  // Delete the test user
  try {
    await deleteUserAccount(testUsername);
  } catch (err) {
    console.error('Error deleting test user:', err);
  }
}
