import { test, expect, type Browser } from '@playwright/test';
import dotenv from 'dotenv';
import { createTestUser, loginUser } from './testHelpers.js';
import { deleteUserAccount } from '../src/utils/userUtils.js';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;
const proposedPassword = 'New-SecuI&SD*^tgsdreP@ssw0rd';

async function expectCredential(
  browser: Browser,
  username: string,
  password: string,
  accepted: boolean,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const login = await context.request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
      form: { username, password },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(302);
    expect(login.headers().location).toBe(accepted ? '/profile' : '/login');

    const settings = await context.request.get(`${SITE_DEPLOYMENT_PATH}/settings`, {
      maxRedirects: 0,
    });
    expect(settings.status()).toBe(accepted ? 200 : 302);
    if (!accepted) {
      expect(settings.headers().location).toBe('/login');
    }
  } finally {
    await context.close();
  }
}

const rejectedChanges = [
  {
    name: 'wrong current password',
    oldPassword: 'Not-the-current-password-284!',
    newPassword: proposedPassword,
    error: 'Old password is incorrect',
  },
  {
    name: 'missing new password',
    error: 'New password is required',
  },
  {
    name: 'weak new password',
    newPassword: 'password',
    error: 'Password is too weak. Please choose a stronger password.',
  },
];

for (const change of rejectedChanges) {
  test(`rejects ${change.name} without changing credentials or the session`, async ({ browser }) => {
    const user = await createTestUser();
    try {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await loginUser(page, user.username, user.password);
        await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${user.username}`);

        const response = await context.request.post(`${SITE_DEPLOYMENT_PATH}/api/change-password`, {
          data: {
            oldPassword: change.oldPassword ?? user.password,
            ...(change.newPassword === undefined ? {} : { newPassword: change.newPassword }),
          },
          maxRedirects: 0,
        });
        expect(response.status()).toBe(400);
        expect(await response.json()).toEqual({ error: change.error });

        const settings = await context.request.get(`${SITE_DEPLOYMENT_PATH}/settings`, {
          maxRedirects: 0,
        });
        expect(settings.status()).toBe(200);

        await expectCredential(browser, user.username, user.password, true);
        await expectCredential(browser, user.username, change.newPassword ?? proposedPassword, false);
      } finally {
        await context.close();
      }
    } finally {
      await deleteUserAccount(user.username);
    }
  });
}

test('a successful password change replaces credentials and invalidates both active browsers', async ({ browser }) => {
  const user = await createTestUser();
  try {
    const changingContext = await browser.newContext();
    try {
      const otherContext = await browser.newContext();
      try {
        const changingPage = await changingContext.newPage();
        const otherPage = await otherContext.newPage();
        await loginUser(changingPage, user.username, user.password);
        await expect(changingPage).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${user.username}`);
        await loginUser(otherPage, user.username, user.password);
        await expect(otherPage).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${user.username}`);

        for (const context of [changingContext, otherContext]) {
          const settings = await context.request.get(`${SITE_DEPLOYMENT_PATH}/settings`, {
            maxRedirects: 0,
          });
          expect(settings.status()).toBe(200);
        }
        const changingSessionCookies = await changingContext.cookies();

        const response = await changingContext.request.post(`${SITE_DEPLOYMENT_PATH}/api/change-password`, {
          data: { oldPassword: user.password, newPassword: proposedPassword },
          maxRedirects: 0,
        });
        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual({ message: 'Password changed successfully' });

        for (const page of [changingPage, otherPage]) {
          await page.goto(`${SITE_DEPLOYMENT_PATH}/settings`);
          await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/login`);
          const protectedApi = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/bans`);
          expect(protectedApi.status()).toBe(401);
        }

        await changingContext.addCookies(changingSessionCookies);
        const replayedSession = await changingContext.request.get(`${SITE_DEPLOYMENT_PATH}/settings`, {
          maxRedirects: 0,
        });
        expect(replayedSession.status()).toBe(302);
        expect(replayedSession.headers().location).toBe('/login');

        await expectCredential(browser, user.username, user.password, false);
        await expectCredential(browser, user.username, proposedPassword, true);
      } finally {
        await otherContext.close();
      }
    } finally {
      await changingContext.close();
    }
  } finally {
    await deleteUserAccount(user.username);
  }
});
