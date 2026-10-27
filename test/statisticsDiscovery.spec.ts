import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const updateModule = pathToFileURL(path.resolve('src/utils/updateUsers.ts')).href;
const storageModule = pathToFileURL(path.resolve('src/storage.ts')).href;
const tsxLoader = import.meta.resolve('tsx');

type Beliefs = Record<string, { choice?: string; comment?: string; commentTime?: number }>;

interface StatisticsFixture {
  directory: string;
  records: Record<string, string>;
}

async function fixture(): Promise<StatisticsFixture> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'belief-statistics-'));
  return { directory, records: {} };
}

function addFixtureUser(root: StatisticsFixture, username: string, beliefs: Beliefs): void {
  root.records[`data/accounts/${username}.json`] = JSON.stringify({ username, passwordHash: 'unused-in-statistics' });
  root.records[`data/users/${username}.json`] = JSON.stringify(beliefs);
}

function refresh(root: StatisticsFixture): void {
  execFileSync(process.execPath, ['--import', tsxLoader, '--input-type=module', '--eval', `
    import { transaction, writeRecord } from ${JSON.stringify(storageModule)};
    import { updateUsersJson } from ${JSON.stringify(updateModule)};
    transaction(() => {
      for (const [key, value] of Object.entries(${JSON.stringify(root.records)})) writeRecord(key, value);
    });
    updateUsersJson();
  `], {
    cwd: root.directory,
    env: { ...process.env, DATABASE_PATH: path.join(root.directory, 'data/belief-garden.sqlite') },
    encoding: 'utf8',
  });
}

function readFixtureRecord(root: StatisticsFixture, key: string): unknown {
  const value = execFileSync(process.execPath, ['--import', tsxLoader, '--input-type=module', '--eval', `
    import { readRecord } from ${JSON.stringify(storageModule)};
    process.stdout.write(readRecord(${JSON.stringify(key)}));
  `], {
    cwd: root.directory,
    env: { ...process.env, DATABASE_PATH: path.join(root.directory, 'data/belief-garden.sqlite') },
    encoding: 'utf8',
  });
  return JSON.parse(value);
}

test('statistics ranks choices and comments by score and publishes only the top twelve', async () => {
  const root = await fixture();

  try {
    for (let count = 0; count < 14; count++) {
      addFixtureUser(root, `rank_${String(count).padStart(2, '0')}`, Object.fromEntries(
        Array.from({ length: count }, (_, i) => [`Belief ${i}`, { choice: 'support' }]),
      ));
    }
    addFixtureUser(root, 'comment_only', { Budgeting: { comment: 'A considered explanation' } });
    addFixtureUser(root, 'choice_and_comment', { Budgeting: { choice: 'reject', comment: 'A considered explanation' } });
    refresh(root);

    const ranking = readFixtureRecord(root, 'public/users.json');
    expect(ranking).toEqual([
      { username: 'choice_and_comment', score: 21 },
      { username: 'comment_only', score: 20 },
      ...Array.from({ length: 10 }, (_, i) => ({ username: `rank_${String(13 - i).padStart(2, '0')}`, score: 13 - i })),
    ]);
  } finally {
    await fs.rm(root.directory, { recursive: true, force: true });
  }
});

test('statistics discovers debate invitations case-insensitively and retains ordinary comments separately', async () => {
  const root = await fixture();
  const invitation = 'Please DEBATE ME about this substantial explanation';
  const shortInvitation = 'debate me';
  const ordinary = 'An ordinary comment that is not an invitation';

  try {
    addFixtureUser(root, 'long_debater', { Budgeting: { choice: 'support', comment: invitation, commentTime: 100 } });
    addFixtureUser(root, 'short_debater', { Budgeting: { comment: shortInvitation, commentTime: 200 } });
    addFixtureUser(root, 'commenter', { Budgeting: { choice: 'reject', comment: ordinary, commentTime: 300 } });
    addFixtureUser(root, 'choice_only', { Budgeting: { choice: 'neutral' } });
    refresh(root);

    expect(readFixtureRecord(root, 'data/debates/Budgeting.json')).toEqual([
      { username: 'long_debater', comment: invitation, timestamp: 100, choice: 'support' },
      { username: 'short_debater', comment: shortInvitation, timestamp: 200, choice: null },
    ]);
    expect(readFixtureRecord(root, 'data/comments/Budgeting.json')).toEqual([
      { username: 'long_debater', comment: invitation, timestamp: 100 },
      { username: 'commenter', comment: ordinary, timestamp: 300 },
      { username: 'short_debater', comment: shortInvitation, timestamp: 200 },
    ]);
  } finally {
    await fs.rm(root.directory, { recursive: true, force: true });
  }
});
