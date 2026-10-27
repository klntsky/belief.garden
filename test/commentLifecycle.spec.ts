import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { createTestUser, loginUser } from './testHelpers.js';
import { deleteUserAccount, getFeed, saveUserBeliefs } from '../src/utils/userUtils.js';
import type { UserBeliefs } from '../src/types/index.js';

dotenv.config();

const { SITE_DEPLOYMENT_PATH } = process.env;

test('comment length validation, editing and clearing preserve the saved choice and replies', async ({ page, request }) => {
  const owner = await createTestUser();
  try {
    const replier = await createTestUser();
    try {
      const beliefName = 'Budgeting';
      const originalTime = 1700000001000;
      const replies = [
        { username: replier.username, comment: 'An existing reply', timestamp: 1700000002000 },
        { username: owner.username, comment: 'An existing owner response', timestamp: 1700000003000 },
      ];
      const originalBelief = {
        choice: 'support',
        comment: 'Original comment: debate me',
        commentTime: originalTime,
        replies,
      };
      await saveUserBeliefs(owner.username, { [beliefName]: originalBelief });

      const beliefsUrl = `${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${owner.username}`;
      const commentUrl = `${beliefsUrl}/${encodeURIComponent(beliefName)}`;
      const readPublicBeliefs = async (): Promise<UserBeliefs> => {
        const response = await request.get(beliefsUrl);
        expect(response.status()).toBe(200);
        return await response.json() as UserBeliefs;
      };
      expect(await readPublicBeliefs()).toEqual({ [beliefName]: originalBelief });

      await loginUser(page, owner.username, owner.password);
      await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${owner.username}`);

      const boundaryComment = 'x'.repeat(400);
      const accepted = await page.request.put(commentUrl, { data: { comment: boundaryComment } });
      expect(accepted.status()).toBe(200);
      const afterBoundary = await readPublicBeliefs();
      expect(afterBoundary).toEqual({
        [beliefName]: {
          choice: 'support',
          comment: boundaryComment,
          commentTime: expect.any(Number),
          replies,
        },
      });
      const boundaryTime = afterBoundary[beliefName]!.commentTime as number;
      expect(boundaryTime).toBeGreaterThan(originalTime);

      const rejected = await page.request.put(commentUrl, {
        data: { choice: 'reject', comment: 'y'.repeat(401) },
      });
      expect(rejected.status()).toBe(400);
      expect(await rejected.json()).toEqual({ error: 'Comment should be no longer than 400 characters.' });
      expect(await readPublicBeliefs()).toEqual(afterBoundary);

      const editedComment = 'An edited comment, with the original conversation intact.';
      const edited = await page.request.put(commentUrl, { data: { comment: editedComment } });
      expect(edited.status()).toBe(200);
      const afterEdit = await readPublicBeliefs();
      expect(afterEdit).toEqual({
        [beliefName]: {
          choice: 'support',
          comment: editedComment,
          commentTime: expect.any(Number),
          replies,
        },
      });
      expect(afterEdit[beliefName]!.commentTime as number).toBeGreaterThanOrEqual(boundaryTime);

      // The mutation response precedes its feed write; settle that write before account cleanup.
      await expect.poll(async () => {
        const feed = await getFeed();
        return feed.some(entry => entry.actor === owner.username
          && entry.type === 'new_comment'
          && entry.beliefName === beliefName
          && entry.text === editedComment);
      }).toBe(true);

      const cleared = await page.request.put(commentUrl, { data: { comment: '' } });
      expect(cleared.status()).toBe(200);
      const afterClear = await readPublicBeliefs();
      expect(afterClear).toEqual({ [beliefName]: { choice: 'support', replies } });
      expect(afterClear[beliefName]).not.toHaveProperty('comment');
      expect(afterClear[beliefName]).not.toHaveProperty('commentTime');
    } finally {
      await deleteUserAccount(replier.username);
    }
  } finally {
    await deleteUserAccount(owner.username);
  }
});
