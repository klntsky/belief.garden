import { test, expect, type Page } from '@playwright/test';
import {
  addUser,
  deleteUserAccount,
  saveUserBeliefs,
} from '../src/utils/userUtils.js';
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
const emptyUsername = 'guess_empty_user';
const maliciousComment = '<img src=x onerror="globalThis.__guessXss=true">';

const answers = {
  Existentialism: 'support',
  Absurdism: 'reject',
  Nihilism: 'neutral',
  Stoicism: 'support',
  Hedonism: 'reject',
  Eudaimonism: 'neutral',
  Egoism: 'support',
  Collectivism: 'reject',
  Individualism: 'neutral',
  Epicureanism: 'support',
  Utilitarianism: 'reject',
  Humanism: 'neutral',
} as const;

type BeliefName = keyof typeof answers;
type Choice = typeof answers[BeliefName];

function otherChoice(choice: Choice): Choice {
  return choice === 'support' ? 'reject' : 'support';
}

async function openGame(page: Page): Promise<void> {
  await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}/guess`);
  await expect(page.getByRole('heading', { name: 'Guess My Beliefs' })).toBeVisible();
}

async function currentBelief(page: Page): Promise<{ name: BeliefName; choice: Choice }> {
  const name = (await page.locator('#guess-belief-name').textContent()) as BeliefName | null;
  if (!name || !(name in answers)) {
    throw new Error(`Unexpected belief card: ${name || '(empty)'}`);
  }
  return { name, choice: answers[name] };
}

test.describe('Guess My Beliefs', () => {
  test.beforeAll(async () => {
    await setupTestUser();
    await deleteUserAccount(emptyUsername);
    await addUser({ username: emptyUsername, passwordHash: 'unused-in-this-test' });
    await saveUserBeliefs(testUsername, {
      ...Object.fromEntries(
        Object.entries(answers).map(([name, choice]) => [name, { choice }]),
      ),
      Existentialism: { choice: 'support', comment: maliciousComment },
      Transcendentalism: { comment: 'No stated position.' },
      'Unknown belief card': { choice: 'support' },
    });
  });

  test.afterAll(async () => {
    await teardownTestUser();
    await deleteUserAccount(emptyUsername);
  });

  test('opens from a profile, includes every stated belief, and links the username', async ({ page }) => {
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    await page.getByRole('link', {
      name: `How well do you know @${testUsername}? Guess their beliefs`,
    }).click();

    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${testUsername}/guess`);
    await expect(page.getByText('position on all 12 beliefs', { exact: false })).toBeVisible();

    await page.getByRole('link', { name: testUsername, exact: true }).first().click();
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);

    await loginUser(page, testUsername, testPassword);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}`);
    await expect(page.getByRole('link', {
      name: 'Invite someone to guess your beliefs',
    })).toBeVisible();
  });

  test('is useful to search and social crawlers without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${testUsername}/guess`);

    await expect(page).toHaveTitle(`Guess @${testUsername}'s Beliefs | belief.garden`);
    await expect(page.getByText('position on all 12 beliefs', { exact: false })).toBeVisible();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      `How well do you know @${testUsername}?`,
    );
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      `How well do you know @${testUsername}? Guess their position on beliefs.`,
    );

    const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(imageUrl).toBeTruthy();
    const imageResponse = await page.request.get(imageUrl as string);
    expect(imageResponse.ok()).toBe(true);
    expect(imageResponse.headers()['content-type']).toBe('image/png');
    await context.close();
  });

  test('reports a wrong guess and reveals the correct choice', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: 'Start guessing' }).click();

    const belief = await currentBelief(page);
    await page.locator(`[data-choice="${otherChoice(belief.choice)}"]`).click();

    await expect(page.getByText('Not quite.')).toBeVisible();
    await expect(page.getByText('Correct choice:')).toBeVisible();
    await expect(page.locator('#guess-answer').getByRole('button', {
      name: belief.choice,
      exact: true,
    })).toBeVisible();
    await expect(page.getByText('0 correct', { exact: true })).toBeVisible();
    await expect(page.getByText('1 answered', { exact: true })).toBeVisible();
  });

  test('starts a fresh game after a refresh', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: 'Start guessing' }).click();

    const belief = await currentBelief(page);
    await page.locator(`[data-choice="${belief.choice}"]`).click();
    await page.reload();

    await page.getByRole('button', { name: 'Start guessing' }).click();
    await expect(page.getByText('0 correct', { exact: true })).toBeVisible();
    await expect(page.getByText('0 answered', { exact: true })).toBeVisible();
    await expect(page.getByText('12 left', { exact: true })).toBeVisible();
  });

  test('scores a complete deck, renders explanations safely, and allows replay', async ({ page }) => {
    await page.addInitScript(() => {
      (globalThis as { __guessXss?: boolean }).__guessXss = false;
    });
    await openGame(page);
    await page.getByRole('button', { name: 'Start guessing' }).click();

    let sawExplainedBelief = false;
    for (let guessNumber = 0; guessNumber < Object.keys(answers).length; guessNumber += 1) {
      const belief = await currentBelief(page);
      await page.locator(`[data-choice="${belief.choice}"]`).click();
      await expect(page.getByText('Correct!')).toBeVisible();

      if (belief.name === 'Existentialism') {
        sawExplainedBelief = true;
        await expect(page.getByText(maliciousComment, { exact: false })).toBeVisible();
        await expect(page.locator('#guess-comment img')).toHaveCount(0);
        expect(await page.evaluate(() => (
          globalThis as { __guessXss?: boolean }
        ).__guessXss)).toBe(false);
      }

      const nextLabel = guessNumber === Object.keys(answers).length - 1
        ? 'See my score'
        : 'Next belief';
      await page.getByRole('button', { name: nextLabel }).click();
    }

    expect(sawExplainedBelief).toBe(true);
    await expect(page.getByText('12 / 12 correct')).toBeVisible();
    await expect(page.getByText('Perfect score', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Play again' }).click();
    await expect(page.getByText('0 correct', { exact: true })).toBeVisible();
    await expect(page.getByText('0 answered', { exact: true })).toBeVisible();
    await expect(page.getByText('12 left', { exact: true })).toBeVisible();
  });

  test('explains when a profile has no beliefs to guess', async ({ page }) => {
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${emptyUsername}/guess`);

    await expect(page.getByRole('heading', { name: 'No beliefs to guess yet' })).toBeVisible();
    await expect(page.getByText(`${emptyUsername} hasn’t answered any belief cards yet.`)).toBeVisible();
  });

  test('does not create a game for a missing profile', async ({ request }) => {
    const response = await request.get(`${SITE_DEPLOYMENT_PATH}/missing_guess_user/guess`);
    expect(response.status()).toBe(404);
  });
});
