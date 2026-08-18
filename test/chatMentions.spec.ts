import { test, expect } from '@playwright/test';
import {
  deleteUserAccount,
  getUserNotifications,
} from '../src/utils/userUtils.js';
import { createTestUser, loginUser } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test('chat notifies only explicitly @-mentioned users', async ({ page }) => {
  const author = await createTestUser();
  const recipient = await createTestUser();

  try {
    await loginUser(page, author.username, author.password);
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/chat`, {
      data: { message: `hello ${recipient.username}` },
    });
    expect(response.status()).toBe(200);

    const notifications = await getUserNotifications(recipient.username);
    expect(notifications).not.toContainEqual(expect.objectContaining({
      type: 'mention',
      actor: author.username,
    }));
  } finally {
    await deleteUserAccount(author.username);
    await deleteUserAccount(recipient.username);
  }
});
