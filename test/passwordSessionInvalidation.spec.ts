import { test, expect } from '@playwright/test';
import {
  loginUser,
  setupTestUser,
  teardownTestUser,
  testPassword,
  testUsername,
} from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test('password changes invalidate every active session', async ({ browser }) => {
  await setupTestUser();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await loginUser(first, testUsername, testPassword);
    await loginUser(second, testUsername, testPassword);

    const response = await first.request.post(`${SITE_DEPLOYMENT_PATH}/api/change-password`, {
      data: {
        oldPassword: testPassword,
        newPassword: 'New-SecuI&SD*^tgsdreP@ssw0rd',
      },
    });
    expect(response.status()).toBe(200);

    await second.goto(`${SITE_DEPLOYMENT_PATH}/settings`);
    await expect(second).toHaveURL(`${SITE_DEPLOYMENT_PATH}/login`);
  } finally {
    await firstContext.close();
    await secondContext.close();
    await teardownTestUser();
  }
});
