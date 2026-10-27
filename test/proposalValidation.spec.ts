import { test as base, expect } from '@playwright/test';
import { deleteRecord, hasRecord, readRecord, writeRecord } from '../src/storage.js';
import dotenv from 'dotenv';
import { createTestUser, loginUser } from './testHelpers.js';
import { deleteUserAccount } from '../src/utils/userUtils.js';
import { addProposedBelief, getProposedBeliefs } from '../src/utils/proposedBeliefsUtils.js';

dotenv.config();
const { SITE_DEPLOYMENT_PATH } = process.env;
const globalFiles = ['data/beliefs.json', 'data/proposed.json', 'data/admins.json'];
interface TestUser {
  username: string;
  password: string;
}

async function readRaw(filePath: string): Promise<string | null> {
  return hasRecord(filePath) ? readRecord(filePath) : null;
}

const test = base.extend<{ proposalUser: TestUser }>({
  proposalUser: async ({ page }, use) => {
    const originals = await Promise.all(globalFiles.map(readRaw));
    let user: TestUser | undefined;
    try {
      // Keep successful submissions, including validation regressions, from notifying real admins.
      writeRecord('data/admins.json', '[]');
      user = await createTestUser();
      await loginUser(page, user.username, user.password);
      await use(user);
    } finally {
      await Promise.all([
        ...globalFiles.map((filePath, index) => {
          const original = originals[index]!;
          if (original === null) {
            if (hasRecord(filePath)) deleteRecord(filePath);
          } else {
            writeRecord(filePath, original);
          }
        }),
        ...(user ? [deleteUserAccount(user.username)] : []),
      ]);
    }
  },
});

test.describe('Proposal validation contracts', () => {
  const requiredCases = [
    { label: 'missing category', field: 'category', value: undefined },
    { label: 'empty category', field: 'category', value: '' },
    { label: 'whitespace-only category', field: 'category', value: ' \t\n ' },
    { label: 'missing name', field: 'name', value: undefined },
    { label: 'empty name', field: 'name', value: '' },
    { label: 'whitespace-only name', field: 'name', value: ' \t\n ' },
    { label: 'missing description', field: 'description', value: undefined },
    { label: 'empty description', field: 'description', value: '' },
    { label: 'whitespace-only description', field: 'description', value: ' \t\n ' },
  ];

  for (const invalid of requiredCases) {
    test(`rejects a ${invalid.label} without changing pending proposals`, async ({ page, proposalUser }) => {
      const proposalsBefore = await readRaw('data/proposed.json');
      const catalogueBefore = await readRaw('data/beliefs.json');
      const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/propose-belief`, {
        data: {
          category: 'Software',
          name: `Required ${proposalUser.username}`,
          description: 'A valid proposal description',
          additionalPrompt: 'A valid optional image prompt',
          [invalid.field]: invalid.value,
        },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toHaveProperty('error');
      expect(await readRaw('data/proposed.json')).toEqual(proposalsBefore);
      expect(await readRaw('data/beliefs.json')).toEqual(catalogueBefore);
    });
  }

  test('accepts name 100, description 500, and additional prompt 300 character boundaries', async ({ page, proposalUser }) => {
    const proposalsBefore = await getProposedBeliefs();
    const catalogueBefore = await readRaw('data/beliefs.json');
    const payload = {
      category: 'Software',
      name: `Boundary ${proposalUser.username}`.padEnd(100, 'n'),
      description: 'd'.repeat(500),
      additionalPrompt: 'p'.repeat(300),
    };
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/propose-belief`, { data: payload });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: 'Proposal submitted successfully' });
    const proposalsAfter = await getProposedBeliefs();
    expect(proposalsAfter).toHaveLength(proposalsBefore.length + 1);
    expect(proposalsAfter.slice(0, -1)).toEqual(proposalsBefore);
    expect(proposalsAfter.at(-1)).toEqual(expect.objectContaining({
      beliefName: payload.name,
      category: payload.category,
      description: payload.description,
      additionalPrompt: payload.additionalPrompt,
      proposedBy: proposalUser.username,
      timestamp: expect.any(Number),
      id: expect.any(String),
    }));
    expect(await readRaw('data/beliefs.json')).toEqual(catalogueBefore);
  });

  const lengthCases = [
    { field: 'name', limit: 100 },
    { field: 'description', limit: 500 },
    { field: 'additionalPrompt', limit: 300 },
  ];
  for (const invalid of lengthCases) {
    test(`rejects ${invalid.field} longer than ${invalid.limit} characters without changing pending proposals`, async ({ page, proposalUser }) => {
      const proposalsBefore = await readRaw('data/proposed.json');
      const catalogueBefore = await readRaw('data/beliefs.json');
      const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/propose-belief`, {
        data: {
          category: 'Software',
          name: `Length ${proposalUser.username}`,
          description: 'A valid proposal description',
          additionalPrompt: 'A valid optional image prompt',
          [invalid.field]: proposalUser.username.padEnd(invalid.limit + 1, 'x'),
        },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toHaveProperty('error');
      expect(await readRaw('data/proposed.json')).toEqual(proposalsBefore);
      expect(await readRaw('data/beliefs.json')).toEqual(catalogueBefore);
    });
  }

  test('rejects a duplicate proposal name without replacing or appending pending data', async ({ page, proposalUser }) => {
    const name = `Duplicate ${proposalUser.username}`;
    await addProposedBelief({
      beliefName: name,
      category: 'Software',
      description: 'Original pending description',
      additionalPrompt: 'Original pending prompt',
      proposedBy: proposalUser.username,
    });
    const proposalsBefore = await readRaw('data/proposed.json');
    const catalogueBefore = await readRaw('data/beliefs.json');
    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/propose-belief`, {
      data: {
        category: 'Software',
        name,
        description: 'A different description must not overwrite the pending proposal',
        additionalPrompt: 'A different prompt must not overwrite the pending proposal',
      },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'A proposal with this name already exists' });
    expect(await readRaw('data/proposed.json')).toEqual(proposalsBefore);
    expect(await readRaw('data/beliefs.json')).toEqual(catalogueBefore);
  });
});
