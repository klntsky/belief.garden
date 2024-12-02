// tests/userRegistrationAndLogin.spec.js

import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('User Registration and Login', () => {
  test('Successful registration and login', async ({ page }) => {
    const uniqueUsername = `user${Date.now()}`;
    const password = 'SecuI&SD*^tgsdreP@ssw0rd';

    // Navigate to the registration page
    await page.goto(`${SITE_DEPLOYMENT_PATH}/register`);

    // Fill out the registration form
    await page.fill('input[name="username"]', uniqueUsername);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Verify registration success
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/login`);

    // Log in with the new account
    await page.fill('input[name="username"]', uniqueUsername);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Verify successful login
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${uniqueUsername}`);

    // Verify that the user's name is displayed
    await expect(page.locator('.nav-links-right #login-username')).toContainText(uniqueUsername);
  });
});
