import { test, expect } from '@playwright/test';
import { createTestUser, loginUser, addAdmin, removeAdmin } from './testHelpers.js';
import { deleteUserAccount } from '../src/utils/userUtils.js';
import { getProposedBeliefs, removeProposedBelief } from '../src/utils/proposedBeliefsUtils.js';
import { readBeliefs, saveBeliefs } from '../src/readBeliefs.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
const { SITE_DEPLOYMENT_PATH } = process.env;

test.describe('Admin Proposal Approval', () => {
  let regularUser: { username: string; password: string };
  let adminUser: { username: string; password: string };
  const testTimeout = 90000;

  test.beforeAll(async () => {
    regularUser = await createTestUser();
    adminUser = await createTestUser();
    // Grant admin rights to adminUser for testing
    await addAdmin(adminUser.username);
  });

  test.beforeEach(async () => {
    try {
      const proposals = await getProposedBeliefs();
      for (const proposal of proposals) {
        try {
          await removeProposedBelief(proposal.timestamp);
        } catch (error) {
        }
      }
    } catch (error) {
    }
  });

  test.afterAll(async () => {
    try {
      const proposals = await getProposedBeliefs();
      for (const proposal of proposals) {
        if (proposal.proposedBy === regularUser.username || proposal.proposedBy === adminUser.username) {
          await removeProposedBelief(proposal.timestamp);
        }
      }
    } catch (error) {
      console.error('Error cleaning up proposals:', error);
    }
    
    // Remove admin rights from adminUser
    await removeAdmin(adminUser.username);
    await deleteUserAccount(regularUser.username);
    await deleteUserAccount(adminUser.username);
  });

  test('Update description for existing belief', async ({ page }) => {
    test.setTimeout(testTimeout);

    const beliefsData = readBeliefs();
    const categories = Object.keys(beliefsData);
    const category = categories[0]!;
    const existingBelief = beliefsData[category as keyof typeof beliefsData]![0]!;

    const beliefName = existingBelief.name;
    const newDescription = `Updated description for testing - ${Date.now()}`;

    await loginUser(page, regularUser.username, regularUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/propose?category=${encodeURIComponent(category)}`);
    await expect(page.locator('h1')).toContainText('Propose a New Belief Card');

    await page.selectOption('#category', category);
    await page.fill('#name', beliefName);
    await page.fill('#description', newDescription);
    
    const dialogPromise = page.waitForEvent('dialog', { timeout: 10000 }).then(dialog => {
      dialog.accept();
    });
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/api/propose-belief') && response.ok()
    );
    
    await page.click('button[type="submit"]');
    await Promise.all([dialogPromise, responsePromise]);
    await page.waitForURL(`${SITE_DEPLOYMENT_PATH}/${regularUser.username}`, { timeout: 10000 });
    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`);
    await page.waitForTimeout(500);

    await loginUser(page, adminUser.username, adminUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/admin/proposed`);
    await expect(page.locator('h1')).toContainText('Review Proposed Belief Cards');

    const proposalCard = page.locator('.proposal-card').first();
    await expect(proposalCard).toBeVisible({ timeout: 1500 });

    const nameInput = proposalCard.locator('input[id^="name-"]').first();
    const proposalId = await nameInput.getAttribute('data-proposal-id');
    expect(proposalId).toBeTruthy();

    const descriptionField = proposalCard.locator(`textarea#description-${proposalId}`);
    await descriptionField.fill(newDescription);
    await page.waitForTimeout(500);

    const approveButton = proposalCard.locator(`.approve-btn[data-proposal-id="${proposalId}"]`);
    const confirmDialogPromise = page.waitForEvent('dialog', { timeout: 1500 }).then(dialog => {
      dialog.accept();
    });
    const approvalResponsePromise = page.waitForResponse(response => 
      response.url().includes('/api/approve-belief') && response.status() === 200,
      { timeout: 10000 }
    );
    
    await approveButton.click();
    await Promise.all([confirmDialogPromise, approvalResponsePromise]);
    
    await page.waitForURL(/\/admin\/proposed/, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await loginUser(page, regularUser.username, regularUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${regularUser.username}`);
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 5000 });
    
    const beliefDescription = await beliefCard.locator('p span').textContent();
    expect(beliefDescription).toContain(newDescription);
  });

  test('Update image for existing belief', async ({ page }) => {
    test.setTimeout(testTimeout);

    const beliefsData = readBeliefs();
    const categories = Object.keys(beliefsData);
    const category = categories[0]!;
    const existingBelief = beliefsData[category as keyof typeof beliefsData]![0]!;

    const beliefName = existingBelief.name;
    const newDescription = `Updated description with image - ${Date.now()}`;

    await loginUser(page, regularUser.username, regularUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/propose?category=${encodeURIComponent(category)}`);
    await expect(page.locator('h1')).toContainText('Propose a New Belief Card');

    await page.selectOption('#category', category);
    await page.fill('#name', beliefName);
    await page.fill('#description', newDescription);
    
    const dialogPromise = page.waitForEvent('dialog', { timeout: 10000 }).then(dialog => {
      dialog.accept();
    });
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/api/propose-belief') && response.ok()
    );
    
    await page.click('button[type="submit"]');
    await Promise.all([dialogPromise, responsePromise]);
    await page.waitForURL(`${SITE_DEPLOYMENT_PATH}/${regularUser.username}`, { timeout: 10000 });
    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`);
    await page.waitForTimeout(500);

    await loginUser(page, adminUser.username, adminUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/admin/proposed`);
    await expect(page.locator('h1')).toContainText('Review Proposed Belief Cards');

    const proposalCard = page.locator('.proposal-card').first();
    await expect(proposalCard).toBeVisible({ timeout: 1500 });

    const nameInput = proposalCard.locator('input[id^="name-"]').first();
    const proposalId = await nameInput.getAttribute('data-proposal-id');
    expect(proposalId).toBeTruthy();

    const generateImageButton = proposalCard.locator(`.generate-image-btn[data-proposal-id="${proposalId}"]`);
    await expect(generateImageButton).toBeVisible();
    await generateImageButton.click();
    await expect(generateImageButton).toContainText(/Generating|Regenerate/, { timeout: 1500 });

    const imagePreview = proposalCard.locator(`#image-preview-${proposalId}`);
    await expect(imagePreview).toBeVisible({ timeout: 90000 });
    
    const previewStatus = proposalCard.locator(`#preview-status-${proposalId}`);
    await expect(previewStatus).toContainText(/successfully|success/, { timeout: 90000 });

    const previewImg = proposalCard.locator(`#preview-img-${proposalId}`);
    await expect(previewImg).toBeVisible({ timeout: 90000 });

    const approveButton = proposalCard.locator(`.approve-btn[data-proposal-id="${proposalId}"]`);
    const confirmDialogPromise = page.waitForEvent('dialog', { timeout: 1500 }).then(dialog => {
      dialog.accept();
    });
    const approvalResponsePromise = page.waitForResponse(response => 
      response.url().includes('/api/approve-belief') && response.status() === 200,
      { timeout: 90000 }
    );
    
    await approveButton.click();
    await Promise.all([confirmDialogPromise, approvalResponsePromise]);
    
    await page.waitForURL(/\/admin\/proposed/, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await loginUser(page, regularUser.username, regularUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${regularUser.username}`);
    const beliefCard = page.locator(`.belief[data-belief-name="${beliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 5000 });
    
    const beliefDescription = await beliefCard.locator('p span').textContent();
    expect(beliefDescription).toContain(newDescription);
    
    await beliefCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    
    const backgroundImage = await beliefCard.evaluate((el) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (globalThis as any).getComputedStyle(el).backgroundImage;
    });
    expect(backgroundImage).not.toBe('none');
  });

  test('Create new belief with image', async ({ page }) => {
    test.setTimeout(testTimeout);

    const newBeliefName = `Test Belief ${Date.now()}`;
    const newDescription = `Test description for new belief - ${Date.now()}`;
    const category = 'Philosophy of Mind';

    await loginUser(page, regularUser.username, regularUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/propose?category=${encodeURIComponent(category)}`);
    await expect(page.locator('h1')).toContainText('Propose a New Belief Card');

    await page.fill('#name', newBeliefName);
    await page.fill('#description', newDescription);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${SITE_DEPLOYMENT_PATH}/${regularUser.username}`, { timeout: 10000 });

    await loginUser(page, adminUser.username, adminUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/admin/proposed`);
    await expect(page.locator('h1')).toContainText('Review Proposed Belief Cards');

    const proposalCard = page.locator('.proposal-card').first();
    await expect(proposalCard).toBeVisible({ timeout: 1500 });

    const nameInput = proposalCard.locator('input[id^="name-"]').first();
    const proposalId = await nameInput.getAttribute('data-proposal-id');
    expect(proposalId).toBeTruthy();

    const generateImageButton = proposalCard.locator(`.generate-image-btn[data-proposal-id="${proposalId}"]`);
    await expect(generateImageButton).toBeVisible();
    await generateImageButton.click();
    await expect(generateImageButton).toContainText(/Generating|Regenerate/, { timeout: 1500 });

    const imagePreview = proposalCard.locator(`#image-preview-${proposalId}`);
    await expect(imagePreview).toBeVisible({ timeout: 90000 });
    
    const previewStatus = proposalCard.locator(`#preview-status-${proposalId}`);
    await expect(previewStatus).toContainText(/successfully|success/, { timeout: 90000 });

    const previewImg = proposalCard.locator(`#preview-img-${proposalId}`);
    await expect(previewImg).toBeVisible({ timeout: 90000 });

    const approveButton = proposalCard.locator(`.approve-btn[data-proposal-id="${proposalId}"]`);
    const confirmDialogPromise = page.waitForEvent('dialog', { timeout: 1500 }).then(dialog => {
      dialog.accept();
    });
    const approvalResponsePromise = page.waitForResponse(response => 
      response.url().includes('/api/approve-belief') && response.status() === 200,
      { timeout: 90000 }
    );
    
    await approveButton.click();
    await Promise.all([confirmDialogPromise, approvalResponsePromise]);
    
    await page.waitForURL(/\/admin\/proposed/, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.goto(`${SITE_DEPLOYMENT_PATH}/logout`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await loginUser(page, regularUser.username, regularUser.password);
    await page.goto(`${SITE_DEPLOYMENT_PATH}/${regularUser.username}`);
    const beliefCard = page.locator(`.belief[data-belief-name="${newBeliefName}"]`);
    await expect(beliefCard).toBeVisible({ timeout: 5000 });
    
    const beliefDescription = await beliefCard.locator('p span').textContent();
    expect(beliefDescription).toContain(newDescription);
    
    await beliefCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    
    const backgroundImage = await beliefCard.evaluate((el) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (globalThis as any).getComputedStyle(el).backgroundImage;
    });
    expect(backgroundImage).not.toBe('none');

    const updatedBeliefs = readBeliefs();
    const categoryBeliefs = updatedBeliefs[category];
    if (categoryBeliefs) {
      const index = categoryBeliefs.findIndex(b => b.name === newBeliefName);
      if (index !== -1) {
        categoryBeliefs.splice(index, 1);
        await saveBeliefs(updatedBeliefs);
      }
    }

    try {
      const imagePath = path.join('public', 'img', `${newBeliefName}.webp`);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      const minImagePath = path.join('public', 'img', 'min', `${newBeliefName}.webp`);
      if (fs.existsSync(minImagePath)) {
        fs.unlinkSync(minImagePath);
      }
    } catch (error) {
      console.error('Error cleaning up image file:', error);
    }
  });
});
