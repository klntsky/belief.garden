import { test, expect } from '@playwright/test';
import { setupTestUser, teardownTestUser, testUsername } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Path traversal', () => {
  test.beforeAll(async () => {
    await setupTestUser();
  });

  test.afterAll(async () => {
    await teardownTestUser();
  });

  test('does not leak account files via user-beliefs userId', async ({ request }) => {
    const traversalUserId = encodeURIComponent(`../accounts/${testUsername}`);
    const response = await request.get(`${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${traversalUserId}`);
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.text();
    expect(body).not.toContain('passwordHash');
  });

  test('does not leak account files via debates beliefName', async ({ request }) => {
    const traversalName = encodeURIComponent(`../accounts/${testUsername}`);
    const response = await request.get(`${SITE_DEPLOYMENT_PATH}/api/debates/${traversalName}`);
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.text();
    expect(body).not.toContain('passwordHash');
  });
});
