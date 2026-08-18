import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test('invalid profile usernames return 404 without hanging', async ({ request }) => {
  const response = await request.get(`${SITE_DEPLOYMENT_PATH}/!!invalid!!`, {
    timeout: 5000,
  });

  expect(response.status()).toBe(404);
});
