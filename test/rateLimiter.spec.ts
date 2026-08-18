import { test, expect } from '@playwright/test';
import { createTestUser, loginUser } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('API rate limiting', () => {
  let user: { username: string; password: string };
  const chatLimit = 2; // Must match CHAT_RATE_LIMIT in src/utils/rateLimiter.ts

  test.beforeAll(async () => {
    user = await createTestUser();
  });

  test('chat rate limiter returns 429 after exceeding limit', async ({ page }) => {
    test.setTimeout(30000);

    await loginUser(page, user.username, user.password);

    const chatUrl = `${SITE_DEPLOYMENT_PATH}/api/chat`;

    // Send messages up to the chat limit
    for (let i = 0; i < chatLimit; i++) {
      const response = await page.request.post(chatUrl, {
        data: {
          message: `Test chat message ${i}`,
        },
      });

      expect(response.status()).toBe(200);
    }

    // Next message should be rate-limited
    const rateLimitedChatResponse = await page.request.post(chatUrl, {
      data: {
        message: 'This message should hit the chat rate limit',
      },
    });

    expect(rateLimitedChatResponse.status()).toBe(429);
    const body = await rateLimitedChatResponse.json();
    expect(body.error).toBe('Rate limit exceeded');
    expect(typeof body.timeUntilNext).toBe('number');
    expect(body.timeUntilNext).toBeGreaterThan(0);
  });

  test('login rate limiter blocks repeated password guesses', async ({ request }) => {
    const username = `missing_${Date.now()}`;

    for (let i = 0; i < 5; i++) {
      const response = await request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
        form: { username, password: `wrong-${i}` },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(302);
    }

    const blocked = await request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
      form: { username, password: 'wrong-blocked' },
      maxRedirects: 0,
    });
    expect(blocked.status()).toBe(429);
  });
});


