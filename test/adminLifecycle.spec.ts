import { test as base, expect } from '@playwright/test';
import { deleteRecord, hasRecord, readRecord, writeRecord } from '../src/storage.js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { createTestUser, loginUser, addAdmin, removeAdmin } from './testHelpers.js';
import { deleteUserAccount, getUserNotifications } from '../src/utils/userUtils.js';
import { addProposedBelief, getProposedBeliefs } from '../src/utils/proposedBeliefsUtils.js';
import { readBeliefs, saveBeliefs } from '../src/readBeliefs.js';

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

const test = base.extend<{ accounts: { regularUser: TestUser; adminUser: TestUser } }>({
  accounts: async ({}, use) => {
    const originals = await Promise.all(globalFiles.map(readRaw));
    const users: TestUser[] = [];
    let adminUser: TestUser | undefined;
    try {
      const regularUser = await createTestUser();
      users.push(regularUser);
      adminUser = await createTestUser();
      users.push(adminUser);
      await addAdmin(adminUser.username);
      await use({ regularUser, adminUser });
    } finally {
      try {
        if (adminUser) await removeAdmin(adminUser.username);
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
          ...users.map(user => deleteUserAccount(user.username)),
        ]);
      }
    }
  },
});

test.describe('Administrator lifecycle contracts', () => {
  test('a logged-in non-admin cannot view admin pages or mutate beliefs and proposals', async ({ page, accounts }) => {
    const category = `Admin access ${randomUUID()}`;
    const beliefName = `Restricted belief ${randomUUID()}`;
    const catalogue = readBeliefs();
    catalogue[category] = [{ name: beliefName, description: 'Original restricted belief' }];
    await saveBeliefs(catalogue);
    await addProposedBelief({
      beliefName,
      category,
      description: 'A proposed change that must not be approved',
      additionalPrompt: null,
      proposedBy: accounts.regularUser.username,
    });
    const proposal = (await getProposedBeliefs()).find(item => item.beliefName === beliefName)!;
    expect(proposal).toBeDefined();
    const catalogueBefore = await readRaw('data/beliefs.json');
    const proposalsBefore = await readRaw('data/proposed.json');
    const adminsBefore = await readRaw('data/admins.json');

    await loginUser(page, accounts.regularUser.username, accounts.regularUser.password);
    for (const route of ['/admin/proposed', '/admin/delete-belief']) {
      const response = await page.goto(`${SITE_DEPLOYMENT_PATH}${route}`);
      expect(response?.status()).toBe(403);
      await expect(page.locator('body')).toContainText('Access denied. This page is only available to administrators.');
    }

    const requests = [
      { route: '/api/approve-belief', data: { proposalId: proposal.timestamp } },
      { route: '/api/reject-belief', data: { proposalId: proposal.timestamp } },
      // A missing proposal also prevents an authorization regression from calling image generation.
      { route: '/api/generate-image-url', data: { proposalId: -1 } },
      { route: '/api/delete-belief', data: { category, beliefName } },
    ];
    for (const request of requests) {
      const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}${request.route}`, { data: request.data });
      expect(response.status(), request.route).toBe(403);
      expect(await response.json()).toEqual({
        error: 'Access denied. Only administrators can access this resource.',
      });
      expect(await readRaw('data/beliefs.json'), request.route).toEqual(catalogueBefore);
      expect(await readRaw('data/proposed.json'), request.route).toEqual(proposalsBefore);
      expect(await readRaw('data/admins.json'), request.route).toEqual(adminsBefore);
    }
  });

  test('rejecting one proposal preserves another and notifies only the selected proposer', async ({ page, accounts }) => {
    const selectedName = `Reject selected ${randomUUID()}`;
    const pendingName = `Keep pending ${randomUUID()}`;
    for (const beliefName of [selectedName, pendingName]) {
      await addProposedBelief({
        beliefName,
        category: 'Software',
        description: `Description for ${beliefName}`,
        additionalPrompt: null,
        proposedBy: beliefName === selectedName ? accounts.regularUser.username : accounts.adminUser.username,
      });
    }
    const proposalsBefore = await getProposedBeliefs();
    const selected = proposalsBefore.find(proposal => proposal.beliefName === selectedName)!;
    const pending = proposalsBefore.find(proposal => proposal.beliefName === pendingName)!;
    expect(selected).toBeDefined();
    expect(pending).toBeDefined();
    const catalogueBefore = await readRaw('data/beliefs.json');
    const notificationsBefore = await getUserNotifications(accounts.regularUser.username);
    const unrelatedNotificationsBefore = await getUserNotifications(accounts.adminUser.username);
    await loginUser(page, accounts.adminUser.username, accounts.adminUser.password);

    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/reject-belief`, {
      data: { proposalId: selected.timestamp },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: `Proposal "${selectedName}" rejected` });
    expect(await getProposedBeliefs()).toEqual(proposalsBefore.filter(proposal => proposal.timestamp !== selected.timestamp));
    expect((await getProposedBeliefs()).find(proposal => proposal.timestamp === pending.timestamp)).toEqual(pending);
    await expect.poll(async () => (await getUserNotifications(accounts.regularUser.username))
      .filter(notification => notification.type === 'belief_rejected' && notification.beliefName === selectedName).length)
      .toBe(1);
    const notificationsAfter = await getUserNotifications(accounts.regularUser.username);
    expect(notificationsAfter).toEqual([
      expect.objectContaining({
        actor: accounts.adminUser.username,
        type: 'belief_rejected',
        beliefName: selectedName,
        message: `Your belief card proposal "${selectedName}" has been rejected.`,
      }),
      ...notificationsBefore,
    ]);
    expect(await getUserNotifications(accounts.adminUser.username)).toEqual(unrelatedNotificationsBefore);
    expect(await readRaw('data/beliefs.json')).toEqual(catalogueBefore);

    const pendingRaw = await readRaw('data/proposed.json');
    const missingResponse = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/reject-belief`, {
      data: { proposalId: selected.timestamp },
    });
    expect(missingResponse.status()).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: 'Proposal not found' });
    expect(await readRaw('data/proposed.json')).toEqual(pendingRaw);
    expect(await getUserNotifications(accounts.regularUser.username)).toEqual(notificationsAfter);
    expect(await getUserNotifications(accounts.adminUser.username)).toEqual(unrelatedNotificationsBefore);
    expect(await readRaw('data/beliefs.json')).toEqual(catalogueBefore);
  });

  test('deleting a seeded belief updates the public catalogue without changing unrelated beliefs', async ({ page, accounts }) => {
    const category = `Delete category ${randomUUID()}`;
    const selected = { name: `Delete belief ${randomUUID()}`, description: 'Selected for deletion' };
    const unrelated = { name: `Keep belief ${randomUUID()}`, description: 'Must remain unchanged' };
    const catalogue = readBeliefs();
    catalogue[category] = [selected, unrelated];
    await saveBeliefs(catalogue);
    const proposalsBefore = await readRaw('data/proposed.json');
    await loginUser(page, accounts.adminUser.username, accounts.adminUser.password);

    const response = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/delete-belief`, {
      data: { category, beliefName: selected.name },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: `Belief "${selected.name}" deleted from "${category}"`,
    });
    const expectedCatalogue = { ...catalogue, [category]: [unrelated] };
    expect(readBeliefs()).toEqual(expectedCatalogue);
    const publicCatalogue = await page.request.get(`${SITE_DEPLOYMENT_PATH}/static/beliefs.json`);
    expect(publicCatalogue.status()).toBe(200);
    expect(await publicCatalogue.json()).toEqual(expectedCatalogue);
    const catalogueAfter = await readRaw('data/beliefs.json');

    const invalidRequests = [
      { data: { beliefName: unrelated.name }, status: 400 },
      { data: { category }, status: 400 },
      { data: { category: `Missing ${randomUUID()}`, beliefName: unrelated.name }, status: 404 },
      { data: { category, beliefName: selected.name }, status: 404 },
    ];
    for (const invalid of invalidRequests) {
      const invalidResponse = await page.request.post(`${SITE_DEPLOYMENT_PATH}/api/delete-belief`, { data: invalid.data });
      expect(invalidResponse.status()).toBe(invalid.status);
      expect(await invalidResponse.json()).toHaveProperty('error');
      expect(await readRaw('data/beliefs.json')).toEqual(catalogueAfter);
      expect(await readRaw('data/proposed.json')).toEqual(proposalsBefore);
      const unchangedPublicCatalogue = await page.request.get(`${SITE_DEPLOYMENT_PATH}/static/beliefs.json`);
      expect(unchangedPublicCatalogue.status()).toBe(200);
      expect(await unchangedPublicCatalogue.json()).toEqual(expectedCatalogue);
    }
  });
});
