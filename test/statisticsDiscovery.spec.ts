import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const updateModule = pathToFileURL(path.resolve('src/utils/updateUsers.ts')).href;
const tsxLoader = import.meta.resolve('tsx');

type Beliefs = Record<string, { choice?: string; comment?: string; commentTime?: number }>;

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'belief-statistics-'));
  await Promise.all(['data/accounts', 'data/users', 'public'].map(directory => fs.mkdir(path.join(root, directory), { recursive: true })));
  return root;
}

async function addFixtureUser(root: string, username: string, beliefs: Beliefs): Promise<void> {
  await fs.writeFile(path.join(root, 'data/accounts', `${username}.json`), JSON.stringify({ username, passwordHash: 'unused-in-statistics' }));
  await fs.writeFile(path.join(root, 'data/users', `${username}.json`), JSON.stringify(beliefs));
}

function refresh(root: string): void {
  execFileSync(process.execPath, ['--import', tsxLoader, '--input-type=module', '--eval', `import { updateUsersJson } from ${JSON.stringify(updateModule)}; updateUsersJson();`], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('statistics ranks choices and comments by score and publishes only the top twelve', async () => {
  const root = await fixture();

  try {
    for (let count = 0; count < 14; count++) {
      await addFixtureUser(root, `rank_${String(count).padStart(2, '0')}`, Object.fromEntries(
        Array.from({ length: count }, (_, i) => [`Belief ${i}`, { choice: 'support' }]),
      ));
    }
    await addFixtureUser(root, 'comment_only', { Budgeting: { comment: 'A considered explanation' } });
    await addFixtureUser(root, 'choice_and_comment', { Budgeting: { choice: 'reject', comment: 'A considered explanation' } });
    refresh(root);

    const ranking = JSON.parse(await fs.readFile(path.join(root, 'public/users.json'), 'utf8'));
    expect(ranking).toEqual([
      { username: 'choice_and_comment', score: 21 },
      { username: 'comment_only', score: 20 },
      ...Array.from({ length: 10 }, (_, i) => ({ username: `rank_${String(13 - i).padStart(2, '0')}`, score: 13 - i })),
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('statistics discovers debate invitations case-insensitively and retains ordinary comments separately', async () => {
  const root = await fixture();
  const invitation = 'Please DEBATE ME about this substantial explanation';
  const shortInvitation = 'debate me';
  const ordinary = 'An ordinary comment that is not an invitation';

  try {
    await addFixtureUser(root, 'long_debater', { Budgeting: { choice: 'support', comment: invitation, commentTime: 100 } });
    await addFixtureUser(root, 'short_debater', { Budgeting: { comment: shortInvitation, commentTime: 200 } });
    await addFixtureUser(root, 'commenter', { Budgeting: { choice: 'reject', comment: ordinary, commentTime: 300 } });
    await addFixtureUser(root, 'choice_only', { Budgeting: { choice: 'neutral' } });
    refresh(root);

    expect(JSON.parse(await fs.readFile(path.join(root, 'data/debates/Budgeting.json'), 'utf8'))).toEqual([
      { username: 'long_debater', comment: invitation, timestamp: 100, choice: 'support' },
      { username: 'short_debater', comment: shortInvitation, timestamp: 200, choice: null },
    ]);
    expect(JSON.parse(await fs.readFile(path.join(root, 'data/comments/Budgeting.json'), 'utf8'))).toEqual([
      { username: 'long_debater', comment: invitation, timestamp: 100 },
      { username: 'commenter', comment: ordinary, timestamp: 300 },
      { username: 'short_debater', comment: shortInvitation, timestamp: 200 },
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
