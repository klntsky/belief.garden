import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestUser } from './testHelpers.js';
import { addUser, deleteUserAccount, getUserByUsername, saveUserBeliefs } from '../src/utils/userUtils.js';
import { deleteRecord, writeRecord } from '../src/storage.js';

const { SITE_DEPLOYMENT_PATH } = process.env;
const varied = ['support', 'neutral', 'reject', 'support', 'reject'];
const opposite = ['reject', 'neutral', 'support', 'reject', 'support'];
type TestUser = { username: string; password: string };

async function authenticate(request: APIRequestContext, user: TestUser): Promise<void> {
  const response = await request.post(`${SITE_DEPLOYMENT_PATH}/login`, {
    form: user,
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe('/profile');
}

const test = base.extend<{ participants: { viewer: TestUser; target: TestUser } }>({
  participants: async ({ request }, use) => {
    const viewer = await createTestUser();
    const target = await createTestUser();
    try {
      await authenticate(request, viewer);
      await use({ viewer, target });
    } finally {
      await deleteUserAccount(target.username);
      await deleteUserAccount(viewer.username);
    }
  },
});

function document(choices: readonly unknown[]): Record<string, { choice: unknown }> {
  return Object.fromEntries(choices.map((choice, index) => [`belief${index}`, { choice }]));
}

function saveChoices(username: string, choices: readonly unknown[]): void {
  writeRecord(`data/users/${username}.json`, JSON.stringify(document(choices)));
}

function externalDatabase(): DatabaseSync {
  const database = new DatabaseSync(path.resolve(process.env.DATABASE_PATH || 'data/belief-garden.sqlite'));
  database.exec('PRAGMA busy_timeout = 30000');
  return database;
}

function externalSave(database: DatabaseSync, username: string, choices: readonly unknown[]): void {
  database.prepare('INSERT INTO records (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(`data/users/${username}.json`, JSON.stringify(document(choices)));
}

async function expectCorrelation(request: APIRequestContext, target: string, expected: number | null): Promise<void> {
  const response = await request.get(`${SITE_DEPLOYMENT_PATH}/api/correlation/${target}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json();
  if (expected === null) {
    expect(body.correlation).toBeNull();
  } else {
    expect(Number.isFinite(body.correlation)).toBe(true);
    expect(body.correlation).toBeCloseTo(expected, 12);
  }
}

test('API preserves Pearson values, shared-choice rules, null and zero in both directions', async ({ request, playwright, participants }) => {
  const { viewer, target } = participants;
  const reverse = await playwright.request.newContext();
  try {
    await authenticate(reverse, target);
    for (const scenario of [
      { viewer: varied, target: varied, expected: 1 },
      { viewer: varied, target: opposite, expected: -1 },
      { viewer: varied, target: varied.slice(0, 4), expected: null },
      { viewer: ['support', 'support', 'support', 'support', 'support'], target: varied, expected: 0 },
      { viewer: ['support', 'reject', 'neutral', 'neutral', 'neutral'], target: ['neutral', 'neutral', 'support', 'reject', 'neutral'], expected: 0 },
      { viewer: ['support', 'unexpected', 'reject', 'support', 'reject'], target: varied, expected: 1 },
      { viewer: ['support', true, 'reject', 'support', 'reject'], target: varied, expected: 1 },
      { viewer: ['support', { unexpected: true }, 'reject', 'support', 'reject'], target: varied, expected: 1 },
      { viewer: varied, target: ['support', 'neutral', 'reject', 'support', ''], expected: null },
      { viewer: varied, target: ['support', 'neutral', 'reject', 'support', false], expected: null },
      { viewer: varied, target: ['support', 'neutral', 'reject', 'support', 0], expected: null },
    ]) {
      saveChoices(viewer.username, scenario.viewer);
      saveChoices(target.username, scenario.target);
      await expectCorrelation(request, target.username, scenario.expected);
      await expectCorrelation(reverse, viewer.username, scenario.expected);
    }

    saveChoices(viewer.username, [...varied, 'reject']);
    writeRecord(`data/users/${target.username}.json`, JSON.stringify({
      ...document(varied),
      unrelated: { choice: 'support' },
    }));
    await expectCorrelation(request, target.username, 1);
    await expectCorrelation(request, viewer.username, 1);
  } finally {
    await reverse.dispose();
  }
});

test('warm API results track either participant through generic and independent SQLite writes', async ({ request, participants }) => {
  const { viewer, target } = participants;
  const database = externalDatabase();
  try {
    saveChoices(viewer.username, varied);
    saveChoices(target.username, varied);
    await expectCorrelation(request, target.username, 1);

    saveChoices(target.username, opposite);
    await expectCorrelation(request, target.username, -1);
    await saveUserBeliefs(viewer.username, Object.fromEntries(opposite.map((choice, index) => [`belief${index}`, { choice }])));
    await expectCorrelation(request, target.username, 1);

    externalSave(database, viewer.username, opposite.slice(0, 4));
    await expectCorrelation(request, target.username, null);
    externalSave(database, viewer.username, opposite);
    await expectCorrelation(request, target.username, 1);
    externalSave(database, target.username, opposite.slice(0, 4));
    await expectCorrelation(request, target.username, null);
    externalSave(database, target.username, varied);
    await expectCorrelation(request, target.username, -1);

    writeRecord(`data/users/${viewer.username}.json`, JSON.stringify({
      ...document(opposite),
      belief0: { choice: 'reject', comment: 'new comment', preference: 40, replies: [{ username: target.username, comment: 'reply', timestamp: 1 }] },
    }));
    writeRecord(`data/users/${target.username}.json`, JSON.stringify({
      ...document(varied), belief1: { choice: 'neutral', favorite: true, preference: 25 },
    }));
    await expectCorrelation(request, target.username, -1);
    const unrelated = `corr_${randomUUID().slice(0, 12)}`;
    try {
      externalSave(database, unrelated, varied);
      await expectCorrelation(request, target.username, -1);
    } finally {
      deleteRecord(`data/users/${unrelated}.json`);
    }
  } finally {
    database.close();
  }
});

test('account deletion, missing documents and recreation cannot return an old result', async ({ request, participants }) => {
  const { viewer, target } = participants;
  const account = await getUserByUsername(target.username);
  expect(account).not.toBeNull();
  saveChoices(viewer.username, varied);
  saveChoices(target.username, varied);
  await expectCorrelation(request, target.username, 1);

  await deleteUserAccount(target.username);
  await expectCorrelation(request, target.username, null);
  await addUser(account!);
  saveChoices(target.username, opposite);
  await expectCorrelation(request, target.username, -1);

  deleteRecord(`data/users/${target.username}.json`);
  saveChoices(target.username, varied);
  await expectCorrelation(request, target.username, 1);
  deleteRecord(`data/users/${target.username}.json`);
  saveChoices(target.username, varied);
  await expectCorrelation(request, target.username, 1);

  deleteRecord(`data/users/${viewer.username}.json`);
  await expectCorrelation(request, target.username, null);
  saveChoices(viewer.username, opposite);
  await expectCorrelation(request, target.username, -1);
  deleteRecord(`data/users/${viewer.username}.json`);
  deleteRecord(`data/users/${target.username}.json`);
  await expectCorrelation(request, target.username, null);
});

test('malformed current sources fail with no-store and recover instead of caching null', async ({ request, participants }) => {
  const { viewer, target } = participants;
  saveChoices(viewer.username, varied);
  saveChoices(target.username, varied);
  await expectCorrelation(request, target.username, 1);

  for (const username of [viewer.username, target.username]) {
    for (const malformed of ['{invalid', 'null', '[]', '42', '{"belief0":null}', '{"belief0":[]}', '{"belief0":"support"}']) {
      writeRecord(`data/users/${username}.json`, malformed);
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await request.get(`${SITE_DEPLOYMENT_PATH}/api/correlation/${target.username}`);
        expect(response.status()).toBe(500);
        expect(response.headers()['cache-control']).toBe('no-store');
      }
      saveChoices(username, varied);
      await expectCorrelation(request, target.username, 1);
    }
  }
  saveChoices(target.username, opposite);
  await expectCorrelation(request, target.username, -1);
});

test('authentication, target validation and session-only viewer selection are no-store', async ({ request, playwright, participants }) => {
  const { viewer, target } = participants;
  const anonymous = await playwright.request.newContext();
  try {
    const unauthorized = await anonymous.get(`${SITE_DEPLOYMENT_PATH}/api/correlation/${target.username}?viewer=${viewer.username}`);
    expect(unauthorized.status()).toBe(401);
    expect(unauthorized.headers()['cache-control']).toBe('no-store');
  } finally {
    await anonymous.dispose();
  }

  for (const invalid of ['ab', 'a'.repeat(31), 'bad name', '../accounts/secret', 'bad.name']) {
    const response = await request.get(`${SITE_DEPLOYMENT_PATH}/api/correlation/${encodeURIComponent(invalid)}`);
    expect(response.status()).toBe(400);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
  await expectCorrelation(request, `missing_${randomUUID().slice(0, 12)}`, null);

  saveChoices(viewer.username, varied);
  saveChoices(target.username, opposite);
  const spoofed = await request.get(`${SITE_DEPLOYMENT_PATH}/api/correlation/${target.username}?viewer=${target.username}&viewerUsername=${target.username}&userId=${target.username}`);
  expect(spoofed.status()).toBe(200);
  expect(spoofed.headers()['cache-control']).toBe('no-store');
  expect(await spoofed.json()).toEqual({ correlation: -1 });
});

test('committed two-user transactions and rolled-back external writes stay coherent', async ({ request, participants }) => {
  const { viewer, target } = participants;
  const database = externalDatabase();
  try {
    saveChoices(viewer.username, varied);
    saveChoices(target.username, varied);
    await expectCorrelation(request, target.username, 1);
    for (const choices of [opposite, varied, opposite]) {
      database.exec('BEGIN IMMEDIATE');
      try {
        externalSave(database, viewer.username, choices);
        externalSave(database, target.username, choices);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      await expectCorrelation(request, target.username, 1);
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      externalSave(database, target.username, varied);
    } finally {
      database.exec('ROLLBACK');
    }
    await expectCorrelation(request, target.username, 1);
    externalSave(database, target.username, varied);
    await expectCorrelation(request, target.username, -1);
  } finally {
    database.close();
  }
});
