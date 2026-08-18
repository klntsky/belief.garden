import { test, expect } from '@playwright/test';
import {
  setupTestUser,
  teardownTestUser,
  testPassword,
  testUsername,
} from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Session security', () => {
  test.beforeAll(setupTestUser);
  test.afterAll(teardownTestUser);

  test('rotates the session on login and requires POST logout', async ({ page }) => {
    await page.goto(`${SITE_DEPLOYMENT_PATH}/login`);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', 'wrong password');
    await page.click('button[type="submit"]');
    const before = (await page.context().cookies()).find(cookie => cookie.name === 'connect.sid');
    expect(before).toBeTruthy();

    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');
    const after = (await page.context().cookies()).find(cookie => cookie.name === 'connect.sid');
    expect(after).toBeTruthy();
    expect(after?.value).not.toBe(before?.value);
    expect(after?.httpOnly).toBe(true);
    expect(after?.sameSite).toBe('Lax');

    const getLogout = await page.request.get(`${SITE_DEPLOYMENT_PATH}/logout`);
    expect(getLogout.status()).toBe(405);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/settings`);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/settings`);

    const postLogout = await page.request.post(`${SITE_DEPLOYMENT_PATH}/logout`);
    expect(postLogout.status()).toBe(200);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/settings`);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/login`);
  });
});
