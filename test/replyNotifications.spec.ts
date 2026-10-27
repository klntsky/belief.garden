import { test, expect } from '@playwright/test';
import type { Notification } from '../src/types/index.js';
import {
  addFollower,
  deleteUserAccount,
  getUserBeliefs,
  getUserNotifications,
  saveUserBeliefs,
} from '../src/utils/userUtils.js';
import { createTestUser, loginUser } from './testHelpers.js';
import dotenv from 'dotenv';

dotenv.config();
const { SITE_DEPLOYMENT_PATH } = process.env;

test('owner and participant replies notify each eligible recipient exactly once', async ({ page, browser }) => {
  const users: { username: string; password: string }[] = [];
  const participantContext = await browser.newContext();
  try {
    const owner = await createTestUser();
    users.push(owner);
    const author = await createTestUser();
    users.push(author);
    const followingParticipant = await createTestUser();
    users.push(followingParticipant);
    const participant = await createTestUser();
    users.push(participant);
    const followerOnly = await createTestUser();
    users.push(followerOnly);
    const outsider = await createTestUser();
    users.push(outsider);
    const beliefName = 'Absurdism';
    const initialReplies = [
      { username: followingParticipant.username, comment: 'Follower contribution', timestamp: 1 },
      { username: participant.username, comment: 'Participant contribution', timestamp: 2 },
      { username: author.username, comment: 'Earlier author contribution', timestamp: 3 },
      { username: followingParticipant.username, comment: 'Second follower contribution', timestamp: 4 },
      { username: participant.username, comment: 'Second participant contribution', timestamp: 5 },
    ];
    await saveUserBeliefs(owner.username, {
      [beliefName]: { comment: 'A multi-person thread: debate me', replies: initialReplies },
    });
    await addFollower(owner.username, followingParticipant.username);
    await addFollower(owner.username, followerOnly.username);
    await loginUser(page, owner.username, owner.password);
    await expect(page).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${owner.username}`);
    const participantPage = await participantContext.newPage();
    await loginUser(participantPage, author.username, author.password);
    await expect(participantPage).toHaveURL(`${SITE_DEPLOYMENT_PATH}/${author.username}`);

    const snapshot = async () => {
      const notifications = new Map<string, Notification[]>();
      for (const user of users) notifications.set(user.username, await getUserNotifications(user.username));
      return notifications;
    };
    const assertDelivery = async (
      before: Map<string, Notification[]>,
      actor: string,
      recipients: Map<string, string>,
    ) => {
      for (const user of users) {
        const previous = before.get(user.username)!;
        const type = recipients.get(user.username);
        const expected = type ? [{
          type,
          actor,
          profileName: owner.username,
          beliefName,
          timestamp: expect.any(Number),
        }, ...previous] : previous;
        expect(await getUserNotifications(user.username), `notifications for ${user.username}`).toEqual(expected);
      }
    };
    const replyUrl = `${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${owner.username}/${encodeURIComponent(beliefName)}/reply`;
    const beforeOwnerReply = await snapshot();
    const ownerResponse = await page.request.post(replyUrl, { data: { comment: 'Owner joins the discussion' } });
    expect(ownerResponse.status()).toBe(200);
    const ownerReply = await ownerResponse.json();
    expect(ownerReply).toEqual({ username: owner.username, comment: 'Owner joins the discussion', timestamp: expect.any(Number) });
    await assertDelivery(beforeOwnerReply, owner.username, new Map([
      [followingParticipant.username, 'self_reply'],
      [followerOnly.username, 'self_reply'],
      [participant.username, 'thread_reply'],
      [author.username, 'thread_reply'],
    ]));
    expect(await getUserBeliefs(owner.username)).toEqual({
      [beliefName]: { comment: 'A multi-person thread: debate me', replies: [...initialReplies, ownerReply] },
    });

    const beforeParticipantReply = await snapshot();
    const participantResponse = await participantPage.request.post(replyUrl, { data: { comment: 'Participant replies to the owner' } });
    expect(participantResponse.status()).toBe(200);
    const participantReply = await participantResponse.json();
    expect(participantReply).toEqual({ username: author.username, comment: 'Participant replies to the owner', timestamp: expect.any(Number) });
    await assertDelivery(beforeParticipantReply, author.username, new Map([
      [owner.username, 'new_reply'],
      [followingParticipant.username, 'thread_reply'],
      [participant.username, 'thread_reply'],
    ]));
    const persisted = {
      [beliefName]: { comment: 'A multi-person thread: debate me', replies: [...initialReplies, ownerReply, participantReply] },
    };
    expect(await getUserBeliefs(owner.username)).toEqual(persisted);
    const publicBeliefs = await page.request.get(`${SITE_DEPLOYMENT_PATH}/api/user-beliefs/${owner.username}`);
    expect(publicBeliefs.status()).toBe(200);
    expect(await publicBeliefs.json()).toEqual(persisted);
  } finally {
    await participantContext.close();
    for (const user of users) await deleteUserAccount(user.username);
  }
});
