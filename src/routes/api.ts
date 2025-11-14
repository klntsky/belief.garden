// src/routes/api.ts

import express, { type Request, type Response } from 'express';
import path from 'path';
import { ensureAuthenticatedApi, ensureAdminAuthenticated } from '../utils/authUtils.js';
import {
  doesUserExist,
  getUserBeliefs,
  saveUserBeliefs,
  toggleUserFavorite,
  adjustPieSlicePoints,
  getUserBio,
  saveUserBio,
  getUserSettings,
  saveUserSettings,
  getUserBeliefsFilePath,
  getUserNotifications,
  addFollower,
  removeFollower,
  pushNotificationToUser,
  pushNotificationToFollowers,
  getUserFollowers,
  getUserFollowing,
  getFeed,
  postFeed,
  withUserBeliefs,
} from '../utils/userUtils.js';
import { perUserWriteLimiter, chatRateLimiter } from '../utils/rateLimiter.js';
import fsSync from 'fs';
import { promises as fs } from 'fs';
import { generateImageForBelief } from '../generateImage.js';
import { readBeliefs, saveBeliefs } from '../readBeliefs.js';
import { compressSingleImage } from '../utils/imageUtils.js';
import { getAdmins } from '../utils/adminUtils.js';
import {
  addProposedBelief,
  findProposedBelief,
  removeProposedBelief,
  updateProposedBelief
} from '../utils/proposedBeliefsUtils.js';
import { ellipsis } from '../utils/textUtils.js';
import type { UserBeliefs } from '../types/index.js';

const debatesDir = path.join('data', 'debates');
const bansDir = path.join('data', 'bans');

const COMMENT_MAX_LENGTH = 400;
const JSON_SIZE_LIMIT = '100kb';
const MAX_CHAT_MENTION_USERNAMES = 3;

const router: express.Router = express.Router();

interface Reply {
  username: string;
  comment: string;
  timestamp: number;
}

interface Ban {
  username: string;
}

interface BeliefWithReplies {
  choice?: string;
  favorite?: boolean;
  pieSlicePoints?: number;
  preference?: number;
  comment?: string;
  commentTime?: number;
  replies?: Reply[];
  [key: string]: unknown;
}

// Route to get user beliefs
router.get('/api/user-beliefs/:userId', (req: Request, res: Response) => {
  const requestedUserId = req.params.userId;
  if (!requestedUserId) {
    res.status(400).json({ error: 'User ID is required' });
    return;
  }
  const userBeliefsFilePath = getUserBeliefsFilePath(requestedUserId);

  // Resolve the absolute path to prevent directory traversal attacks
  const absolutePath = path.resolve(userBeliefsFilePath);

  // Send the file directly
  res.sendFile(absolutePath, (err?: Error | null) => {
    if (err) {
      console.error('Error sending user beliefs file:', err);
      const status = (err as { status?: number }).status || 500;
      res
        .status(status)
        .json({ error: 'User beliefs not found.' });
    }
  });
});

// Only authenticated users can edit their own beliefs
router.put(
  '/api/user-beliefs/:userId/:beliefName',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const beliefName = req.params.beliefName;
    const authenticatedUserId = req.user?.id as string | undefined;
    if (!authenticatedUserId || !beliefName) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (req.params.userId !== authenticatedUserId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const beliefData = req.body as { choice?: string | null; comment?: string };

    try {
      const result = await withUserBeliefs(authenticatedUserId, async () => {
        const userBeliefs = await getUserBeliefs(authenticatedUserId);

        if (!userBeliefs[beliefName]) {
          userBeliefs[beliefName] = {};
        }

        const belief = userBeliefs[beliefName]!;
        const oldChoice = belief.choice as string | undefined;

        if ('choice' in beliefData) {
          if (beliefData.choice === null) {
            delete belief.choice;
          } else {
            belief.choice = beliefData.choice;
          }
        }

        const oldComment = belief.comment as string | undefined;

        if ('comment' in beliefData) {
          const comment = beliefData.comment;
          if (!comment) {
            delete belief.comment;
            delete belief.commentTime;
          } else if (comment.length > COMMENT_MAX_LENGTH) {
            throw new Error(`Comment should be no longer than ${COMMENT_MAX_LENGTH} characters.`);
          } else if (comment === '') {
            delete belief.comment;
            delete belief.commentTime;
          } else {
            belief.comment = comment;
            belief.commentTime = Date.now();
          }
        }

        // If the belief entry is empty, remove it
        if (Object.keys(belief).length === 0) {
          delete userBeliefs[beliefName];
        }

        await saveUserBeliefs(authenticatedUserId, userBeliefs);
        return { userBeliefs, oldChoice, oldComment };
      });

      res.status(200).json({ message: 'User belief updated successfully.' });

      // Post notifications outside the queue
      if ('choice' in beliefData) {
        await postFeed({
          actor: authenticatedUserId,
          type: 'choice_changed',
          beliefName,
          old_choice: result.oldChoice,
          new_choice: beliefData.choice || null
        });
      }

      if ('comment' in beliefData && beliefData.comment && typeof beliefData.comment === 'string') {
        await postFeed({
          actor: authenticatedUserId,
          type: 'new_comment',
          text: ellipsis(beliefData.comment, 100),
          beliefName
        });
      }

      if ('comment' in beliefData && beliefData.comment && typeof beliefData.comment === 'string' && beliefData.comment !== '') {
        if (!result.oldComment) {
          await pushNotificationToFollowers(authenticatedUserId, {
            type: 'new_comment',
            actor: authenticatedUserId,
            beliefName,
            text: ellipsis(beliefData.comment, 50)
          });
        }
      }
    } catch (error) {
      console.error('Error saving user beliefs:', error);
      const errorMessage = error instanceof Error ? error.message : 'Internal server error.';
      res.status(400)
         .json({ error: errorMessage });
    }
  }
);

// Fetch user's pie chart data
router.get('/api/user-piechart/:userId', async (req: Request, res: Response) => {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: 'User ID is required' });
    return;
  }
  try {
    const userBeliefs = await getUserBeliefs(userId);

    // Extract beliefs with preference
    const piechart: Record<string, number> = {};
    for (const [beliefName, beliefData] of Object.entries(userBeliefs)) {
      if (typeof beliefData.preference === 'number') {
        piechart[beliefName] = beliefData.preference;
      }
    }
    res.json(piechart);
  } catch (error) {
    console.error('Error fetching user pie chart:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Adjust pie slice size
router.post(
  '/api/user-piechart/:userId/:beliefName/:action',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json(),
  async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const beliefName = req.params.beliefName;
    const action = req.params.action as 'increase' | 'decrease';
    const authenticatedUserId = req.user?.id as string | undefined;
    if (!authenticatedUserId || !userId || !beliefName) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (authenticatedUserId !== userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const updatedUserBeliefs = await adjustPieSlicePoints(
        userId,
        beliefName,
        action
      );
      const updatedPreference = updatedUserBeliefs[beliefName]?.preference;
      res.json({ beliefName, preference: updatedPreference });
    } catch (error) {
      console.error('Error adjusting pie slice:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  }
);

// Toggle favorite status
router.post(
  '/api/user-favorites/:userId/:beliefName',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const beliefName = req.params.beliefName;
    const authenticatedUserId = req.user?.id as string | undefined;
    if (!authenticatedUserId || !userId || !beliefName) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (authenticatedUserId !== userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const isFavorite = await toggleUserFavorite(userId, beliefName);
      await postFeed({
        actor: userId,
        type: 'core_belief_changed',
        beliefName,
        isFavorite: isFavorite
      });
      res.json({ isFavorite });
    } catch (error) {
      console.error('Error toggling favorite:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Get user bio
router.get('/api/user-bio/:userId', async (req: Request, res: Response) => {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: 'User ID is required' });
    return;
  }

  try {
    const bioText = await getUserBio(userId);
    res.setHeader('Content-Type', 'text/plain');
    res.send(bioText);
  } catch (error) {
    console.error('Error fetching user bio:', error);
    res.status(500).send('Error fetching bio.');
  }
});

// Save user bio
router.post(
  '/api/user-bio/:userId',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.text(),
  async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const authenticatedUserId = req.user?.id as string | undefined;
    if (!authenticatedUserId || !userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (authenticatedUserId !== userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    const bioText = req.body as string;
    if (bioText.length > 1500) {
      res.status(400).json({
        error: 'Bio cannot exceed 1500 characters.',
      });
      return;
    }

    try {
      const oldBio = await getUserBio(userId);
      if (oldBio.length === 0) {
        await postFeed({
          actor: userId,
          type: 'bio_updated'
        });
      }
      await saveUserBio(userId, bioText);
      res.status(200).send('Bio saved.');
    } catch (error) {
      console.error('Error saving user bio:', error);
      res.status(500).json({ error: 'Error saving bio.' });
    }
  }
);

// Get debate matchmaking participants for a belief
router.get('/api/debates/:beliefName', async (req: Request, res: Response) => {
  const beliefName = req.params.beliefName;
  if (!beliefName) {
    res.status(400).json({ error: 'Belief name is required' });
    return;
  }
  const filePath = path.join(debatesDir, `${beliefName}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      res.json([]); // Return empty array if no debate file exists
    } else {
      console.error('Error reading debate file:', error);
      res.status(500).json({ error: 'Error fetching debate data' });
    }
  }
});

// Add a reply to a comment
router.post(
  '/api/user-beliefs/:userId/:beliefName/reply',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { userId, beliefName } = req.params;
    const { comment } = req.body as { comment?: string };
    const authenticatedUserId = req.user?.id as string | undefined;
    if (!authenticatedUserId || !userId || !beliefName) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!comment) {
      res.status(400).json({ error: 'Reply text is required.' });
      return;
    }

    if (comment.length > COMMENT_MAX_LENGTH) {
      res.status(400).json({
        error: `Reply should be no longer than ${COMMENT_MAX_LENGTH} characters.`,
      });
      return;
    }

    try {
      // Check if user is banned
      const banFilePath = path.join(bansDir, `${userId}.json`);
      let bans: Ban[] = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8')) as Ban[];
        if (bans.some(ban => ban.username === authenticatedUserId)) {
          res.status(403).json({ error: 'You are banned from replying to this profile' });
          return;
        }
      } catch (err) {
        const error = err as { code?: string };
        // If file doesn't exist, user isn't banned
        if (error.code !== 'ENOENT') throw err;
      }

      const settings = await getUserSettings(userId);

      const [reply, userBeliefs] = await withUserBeliefs(userId, async () => {
        const userBeliefs = await getUserBeliefs(userId);

        if (!userBeliefs[beliefName]) {
          throw new Error('Belief not found.');
        }

        const belief = userBeliefs[beliefName] as BeliefWithReplies;

        // Check if the belief has a comment
        const beliefComment = belief.comment;
        if (!beliefComment || typeof beliefComment !== 'string') {
          throw new Error('Cannot reply to an empty comment.');
        }

        // Check if the comment contains "debate me"
        if (!settings.allowAllDebates) {
          const commentText = beliefComment.toLowerCase();
          if (!commentText.includes('debate me')) {
            throw new Error('Can only reply to comments that include "debate me".');
          }
        }

        // For non-owners, prevent consecutive replies
        if (authenticatedUserId !== userId) {
          const replies = belief.replies || [];
          const lastReply = replies[replies.length - 1];
          if (lastReply && lastReply.username === authenticatedUserId) {
            throw new Error('Subsequent replies are not allowed. You can delete your last comment and send a new one.');
          }
        }

        // For own profile, check if there's at least one reply from another user
        if (userId === authenticatedUserId) {
          const hasOtherReplies = belief.replies?.some(
            reply => reply.username !== authenticatedUserId
          );
          if (!hasOtherReplies) {
            throw new Error('Cannot reply until someone else replies first.');
          }
        }

        // Check reply length
        const lines = comment.split('\n');
        if (lines.length > 20) {
          throw new Error('Reply cannot be longer than 20 lines.');
        }

        // Initialize replies array if it doesn't exist
        if (!belief.replies) {
          belief.replies = [];
        }

        // Add the new reply
        const newReply: Reply = {
          username: authenticatedUserId,
          comment,
          timestamp: Date.now()
        };

        belief.replies.push(newReply);

        // Sort replies by timestamp
        belief.replies.sort((a, b) => a.timestamp - b.timestamp);

        await saveUserBeliefs(userId, userBeliefs);
        return [newReply, userBeliefs] as [Reply, UserBeliefs];
      });

      // Send notifications outside the queue
      await postFeed({
        actor: authenticatedUserId,
        type: 'new_reply',
        text: comment,
        beliefName,
        profileName: userId
      });

      let notifiedFollowers: string[] = [];

      // Push notification for the belief owner if it's not their own reply
      if (userId !== authenticatedUserId) {
        await pushNotificationToUser(userId, {
          actor: authenticatedUserId,
          profileName: userId,
          beliefName,
          type: 'new_reply',
        });
      } else {
        // Push notification to all followers of the authenticated user (reply author)
        // Users that are following the profile owner won't be notified
        notifiedFollowers = await pushNotificationToFollowers(userId, {
          actor: authenticatedUserId,
          profileName: userId,
          beliefName,
          type: 'self_reply',
        });
      }

      // Push notification to all the earlier reply posters, except of
      // the current user, the profile owner, and those who
      // have already been notified
      const belief = userBeliefs[beliefName]! as BeliefWithReplies;
      const allThreadParticipants = new Set<string>(
        (belief.replies || [])
          .map(reply => reply.username)
      );
      allThreadParticipants.delete(authenticatedUserId);
      allThreadParticipants.delete(userId);
      for (const notifiedFollower of notifiedFollowers) {
        allThreadParticipants.delete(notifiedFollower);
      }
      for (const threadParticipant of allThreadParticipants) {
        await pushNotificationToUser(threadParticipant, {
          actor: authenticatedUserId,
          profileName: userId,
          beliefName,
          type: 'thread_reply',
        });
      }

      res.status(200).json(reply);
    } catch (error) {
      console.error('Error adding reply:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error adding reply.';
      res.status(400)
         .json({ error: errorMessage });
    }
  }
);

// Delete a reply
router.delete(
  '/api/user-beliefs/:userId/:beliefName/reply/:timestamp',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  async (req: Request, res: Response) => {
    const { userId, beliefName, timestamp } = req.params;
    const authenticatedUserId = req.user?.id as string | undefined;
    if (!authenticatedUserId || !userId || !beliefName || !timestamp) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      await withUserBeliefs(userId, async () => {
        const userBeliefs = await getUserBeliefs(userId);

        const belief = userBeliefs[beliefName]! as BeliefWithReplies | undefined;
        if (!belief || !belief.replies) {
          throw new Error('Belief or replies not found.');
        }

        const replyIndex = belief.replies.findIndex(
          reply => reply.timestamp === parseInt(timestamp, 10)
        );

        if (replyIndex === -1) {
          throw new Error('Reply not found.');
        }

        const reply = belief.replies[replyIndex]!;

        // Check if user is authorized to delete the reply
        if (authenticatedUserId !== userId && authenticatedUserId !== reply.username) {
          throw new Error('Not authorized to delete this reply.');
        }

        // Remove the reply
        belief.replies.splice(replyIndex, 1);

        await saveUserBeliefs(userId, userBeliefs);
      });

      res.status(200).json({ message: 'Reply deleted successfully.' });
    } catch (error) {
      console.error('Error deleting reply:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error deleting reply.';
      const status = errorMessage.includes('not found') ? 404 :
                errorMessage.includes('Not authorized') ? 403 : 500;
      res.status(status)
         .json({ error: errorMessage });
    }
  }
);

// Ban a user from replying to a profile
router.post('/api/ban-user',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { bannedUser, deleteReplies } = req.body as { bannedUser?: string; deleteReplies?: boolean };
    const profileOwner = req.user?.id as string | undefined;
    if (!profileOwner) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!bannedUser) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (bannedUser === profileOwner) {
      res.status(400).json({ error: 'Cannot ban yourself.' });
      return;
    }

    const banFilePath = path.join(bansDir, `${profileOwner}.json`);

    try {
      let bans: Ban[] = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8')) as Ban[];
      } catch (err) {
        const error = err as { code?: string };
        if (error.code !== 'ENOENT') throw err;
      }

      if (!bans.some(ban => ban.username === bannedUser)) {
        bans.push({ username: bannedUser });
        await fs.writeFile(banFilePath, JSON.stringify(bans, null, 2));
      }

      // Delete all replies by the banned user if requested
      if (deleteReplies) {
        await withUserBeliefs(profileOwner, async () => {
          const userBeliefs = await getUserBeliefs(profileOwner);
          let modified = false;

          for (const belief of Object.values(userBeliefs)) {
            const beliefWithReplies = belief as BeliefWithReplies;
            if (beliefWithReplies.replies) {
              const originalLength = beliefWithReplies.replies.length;
              beliefWithReplies.replies = beliefWithReplies.replies.filter(reply => reply.username !== bannedUser);
              if (beliefWithReplies.replies.length !== originalLength) {
                modified = true;
              }
            }
          }

          if (modified) {
            await saveUserBeliefs(profileOwner, userBeliefs);
          }
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error banning user:', error);
      res.status(500).json({ error: 'Failed to ban user' });
    }
  }
);

// Get current bans for a profile
router.get('/api/bans',
  ensureAuthenticatedApi,
  async (req: Request, res: Response) => {
    const profileOwner = req.user?.id as string | undefined;
    if (!profileOwner) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const banFilePath = path.join(bansDir, `${profileOwner}.json`);

    try {
      let bans: Ban[] = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8')) as Ban[];
      } catch (err) {
        const error = err as { code?: string };
        if (error.code !== 'ENOENT') throw err;
      }
      res.json(bans);
    } catch (error) {
      console.error('Error getting bans:', error);
      res.status(500).json({ error: 'Failed to get bans' });
    }
  }
);

// Unban a user
router.post('/api/unban-user',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { bannedUser } = req.body as { bannedUser?: string };
    const profileOwner = req.user?.id as string | undefined;
    if (!profileOwner) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!bannedUser) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const banFilePath = path.join(bansDir, `${profileOwner}.json`);

    try {
      let bans: Ban[] = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8')) as Ban[];
      } catch (err) {
        const error = err as { code?: string };
        if (error.code !== 'ENOENT') {
          throw err;
        }
        res.json({ success: true }); // No bans file means user isn't banned
        return;
      }

      bans = bans.filter(ban => ban.username !== bannedUser);
      await fs.writeFile(banFilePath, JSON.stringify(bans, null, 2));

      res.json({ success: true });
    } catch (error) {
      console.error('Error unbanning user:', error);
      res.status(500).json({ error: 'Failed to unban user' });
    }
  }
);

// Get notifications since timestamp
router.get('/api/notifications', ensureAuthenticatedApi, async (req: Request, res: Response) => {
  const authenticatedUserId = req.user?.id as string | undefined;
  if (!authenticatedUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const since = parseInt((req.query.since as string) || '0', 10);
    const notifications = await getUserNotifications(authenticatedUserId);

    // Filter notifications newer than the given timestamp
    const recentNotifications = notifications.filter(n => (n.timestamp || 0) > since);

    res.json(recentNotifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Check if user is following another user
router.get('/api/follow/:userId', ensureAuthenticatedApi, async (req: Request, res: Response) => {
  const authenticatedUserId = req.user?.id as string | undefined;
  const targetUserId = req.params.userId;
  if (!authenticatedUserId || !targetUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {

    // Can't follow yourself
    if (targetUserId === authenticatedUserId) {
      res.status(400).json(false);
      return;
    }

    const followers = await getUserFollowers(targetUserId);
    const isFollowing = followers.includes(authenticatedUserId);

    res.json(isFollowing);
  } catch (error) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

// Follow a user
router.put('/api/follow/:userId', ensureAuthenticatedApi, perUserWriteLimiter, async (req: Request, res: Response) => {
  const userToFollow = req.params.userId;
  const follower = req.user?.id as string | undefined;
  if (!follower || !userToFollow) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (userToFollow === follower) {
    res.status(400).json({ error: 'Cannot follow yourself.' });
    return;
  }

  try {
    await addFollower(userToFollow, follower);
    await postFeed({
      actor: follower,
      type: 'followed_user',
      user: userToFollow
    });
    res.json({ message: 'Successfully followed user.' });
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Unfollow a user
router.delete('/api/follow/:userId', ensureAuthenticatedApi, perUserWriteLimiter, async (req: Request, res: Response) => {
  const userToUnfollow = req.params.userId;
  const follower = req.user?.id as string | undefined;
  if (!follower || !userToUnfollow) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (userToUnfollow === follower) {
    res.status(400).json({ error: 'Cannot unfollow yourself.' });
    return;
  }

  try {
    await removeFollower(userToUnfollow, follower);
    await postFeed({
      actor: follower,
      type: 'unfollowed_user',
      user: userToUnfollow
    });
    res.json({ message: 'Successfully unfollowed user.' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get following list for authenticated user
router.get('/api/following', ensureAuthenticatedApi, async (req: Request, res: Response) => {
  const authenticatedUserId = req.user?.id as string | undefined;
  if (!authenticatedUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const following = await getUserFollowing(authenticatedUserId);
    res.json({ following });
  } catch (error) {
    console.error('Error getting following list:', error);
    res.status(500).json({ error: 'Failed to get following list' });
  }
});

// Settings endpoints
router.get('/api/settings', ensureAuthenticatedApi, async (req: Request, res: Response) => {
  const authenticatedUserId = req.user?.id as string | undefined;
  if (!authenticatedUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const settings = await getUserSettings(authenticatedUserId);
    res.json(settings);
  } catch (error) {
    console.error('Error getting user settings:', error);
    res.status(500).json({ error: 'Failed to get user settings' });
  }
});

router.post('/api/settings', ensureAuthenticatedApi, perUserWriteLimiter, express.json(), async (req: Request, res: Response) => {
  const authenticatedUserId = req.user?.id as string | undefined;
  if (!authenticatedUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const settings = await getUserSettings(authenticatedUserId);
    const updatedSettings = { ...settings, ...req.body };
    await saveUserSettings(authenticatedUserId, updatedSettings);
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ error: 'Failed to save user settings' });
  }
});

router.get('/api/settings/:userId', async (req: Request, res: Response) => {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: 'User ID is required' });
    return;
  }
  try {
    const settings = await getUserSettings(userId);
    res.json(settings);
  } catch (error) {
    console.error('Error getting user settings:', error);
    res.status(500).json({ error: 'Failed to get user settings' });
  }
});

// Get global feed entries
router.get('/api/feed', async (req: Request, res: Response) => {
  try {
    const since = parseInt((req.query.since as string) || '0', 10);
    const feed = await getFeed();
    const recentFeed = feed.filter(entry => entry.timestamp > since);
    res.json(recentFeed);
  } catch (error) {
    console.error('Error getting feed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Chat endpoint
router.post(
  '/api/chat',
  ensureAuthenticatedApi,
  chatRateLimiter,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { message } = req.body as { message?: unknown };
    const userId = req.user?.id as string | undefined;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Invalid message format' });
      return;
    }

    if (message.length > COMMENT_MAX_LENGTH) {
      res.status(400).json({ error: 'Message too long' });
      return;
    }

    const mentionedUsernames = new Set(message.match(/[a-zA-Z0-9_-]{3,30}/g) || []);

    if (mentionedUsernames.size > MAX_CHAT_MENTION_USERNAMES) {
      res.status(400).json(
        { error: `No more than ${MAX_CHAT_MENTION_USERNAMES} user mentions per message` }
      );
      return;
    }

    try {
      await postFeed({
        actor: userId,
        type: 'chat_message',
        message: message,
      });
      for (const mentionedUser of mentionedUsernames) {
        if (await doesUserExist(mentionedUser)) {
          await pushNotificationToUser(mentionedUser, {
            actor: userId,
            type: 'mention',
            message: ellipsis(message, 100),
          });
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error posting chat message:', error);
      res.status(500).json({ error: 'Failed to post message' });
    }
  }
);

// Endpoint to propose a new belief card
router.post(
  '/api/propose-belief',
  ensureAuthenticatedApi,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { category, name, description, additionalPrompt } = req.body as {
      category?: string;
      name?: string;
      description?: string;
      additionalPrompt?: string;
    };
    const author = req.user?.id as string | undefined;
    if (!author) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!category || !name || !description) {
      res.status(400).json({ error: 'category, name, and description are required' });
      return;
    }

    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      res.status(400).json({ error: 'name must be a non-empty string with max 100 characters' });
      return;
    }

    if (typeof description !== 'string' || description.trim().length === 0 || description.length > 500) {
      res.status(400).json({ error: 'description must be a non-empty string with max 500 characters' });
      return;
    }

    if (additionalPrompt && (typeof additionalPrompt !== 'string' || additionalPrompt.length > 300)) {
      res.status(400).json({ error: 'additionalPrompt must be a string with max 300 characters' });
      return;
    }

    try {
      const proposal = {
        category: category.trim(),
        beliefName: name.trim(),
        description: description.trim(),
        additionalPrompt: additionalPrompt ? additionalPrompt.trim() : null,
        proposedBy: author
      };

      await addProposedBelief(proposal);

      // Send notification to all admins
      const admins = await getAdmins();
      await Promise.all(admins.map(admin => {
        try {
          return pushNotificationToUser(admin, {
            actor: author,
            type: 'belief_proposal',
            beliefName: proposal.beliefName,
            category: proposal.category,
            message: `New belief card proposal: "${proposal.beliefName}"`
          });
        } catch (error) {
          console.error(`Failed to send notification to admin ${admin}:`, error);
          return Promise.resolve(); // Continue with other admins
        }
      }));

      res.json({ success: true, message: 'Proposal submitted successfully' });
    } catch (error) {
      console.error('Error submitting proposal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage === 'A proposal with this name already exists') {
        res.status(400).json({ error: errorMessage });
        return;
      }
      res.status(500).json({ error: 'Failed to submit proposal', details: errorMessage });
    }
  }
);

// Endpoint to approve a proposed belief card (only for admins)
router.post(
  '/api/approve-belief',
  ensureAdminAuthenticated,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { proposalId, name, category, description, additionalPrompt } = req.body as {
      proposalId?: number;
      name?: string;
      category?: string;
      description?: string;
      additionalPrompt?: string | null;
    };

    if (!proposalId || typeof proposalId !== 'number') {
      res.status(400).json({ error: 'proposalId is required and must be a number' });
      return;
    }

    try {
      let proposal = await findProposedBelief(proposalId);
      
      if (!proposal) {
        res.status(404).json({ error: 'Proposal not found' });
        return;
      }

      // Update proposal if fields were edited
      const updates: Partial<{ beliefName: string; category: string; description: string; additionalPrompt: string | null }> = {};
      if (name !== undefined && typeof name === 'string' && name.trim() !== proposal.beliefName) {
        updates.beliefName = name.trim();
      }
      if (category !== undefined && typeof category === 'string' && category.trim() !== proposal.category) {
        updates.category = category.trim();
      }
      if (description !== undefined && typeof description === 'string' && description.trim() !== proposal.description) {
        updates.description = description.trim();
      }
      if (additionalPrompt !== undefined) {
        updates.additionalPrompt = (additionalPrompt && typeof additionalPrompt === 'string') ? additionalPrompt.trim() || null : null;
      }

      if (Object.keys(updates).length > 0) {
        proposal = await updateProposedBelief(proposalId, updates as Partial<{ beliefName: string; category: string; description: string; additionalPrompt: string | null }>);
        if (!proposal) {
          res.status(404).json({ error: 'Proposal not found after update' });
          return;
        }
      }

      // Read beliefs.json
      const beliefsData = readBeliefs();

      // Check if belief already exists
      const categoryBeliefs = beliefsData[proposal.category];
      const existingBeliefIndex = categoryBeliefs?.findIndex((b: { name: string }) => b.name === proposal.beliefName);
      const beliefExists = existingBeliefIndex !== undefined && existingBeliefIndex !== -1;

      if (beliefExists && categoryBeliefs && existingBeliefIndex !== undefined && existingBeliefIndex !== -1) {
        // Update description for existing belief
        const existingBelief = categoryBeliefs[existingBeliefIndex];
        if (existingBelief) {
          existingBelief.description = typeof proposal.description === 'string' ? proposal.description : String(proposal.description);
        }
        await saveBeliefs(beliefsData);
        
        // Remove proposal
        await removeProposedBelief(proposalId);

        // Send notification to the proposer
        try {
          await pushNotificationToUser(proposal.proposedBy, {
            actor: (req.user?.id || '') as string,
            type: 'belief_approved',
            beliefName: proposal.beliefName,
            message: `Your belief card proposal "${proposal.beliefName}" has been approved!`
          });
        } catch (error) {
          console.error(`Failed to send approval notification to ${proposal.proposedBy}:`, error);
        }

        res.json({ 
          success: true, 
          message: `Belief "${proposal.beliefName}" description updated in ${proposal.category}` 
        });
        return;
      }

      // Generate image for new belief
      const belief = {
        name: proposal.beliefName,
        description: typeof proposal.description === 'string' ? proposal.description : String(proposal.description)
      };

      // Use the additional prompt from the request (admin edited) or from the proposal
      const imagePrompt: string | null = additionalPrompt !== undefined 
        ? (additionalPrompt && typeof additionalPrompt === 'string' ? additionalPrompt.trim() : null)
        : (typeof proposal.additionalPrompt === 'string' ? proposal.additionalPrompt : null);
      await generateImageForBelief(proposal.category, belief, imagePrompt);

      // Check if image was generated
      const imagePath = path.join('public', 'img', `${belief.name}.webp`);
      if (!fsSync.existsSync(imagePath)) {
        res.status(500).json({ 
          error: 'Image generation failed',
          details: 'The image file was not created. Check server logs for details.'
        });
        return;
      }

      // Compress the image
      await compressSingleImage(imagePath);

      // Add belief to beliefs.json
      if (!beliefsData[proposal.category]) {
        beliefsData[proposal.category] = [];
      }
      (beliefsData[proposal.category] as Array<{ name: string; description: string }>).push({
        name: proposal.beliefName,
        description: typeof proposal.description === 'string' ? proposal.description : String(proposal.description)
      });

      // Save beliefs.json
      await saveBeliefs(beliefsData);

      // Remove proposal
      await removeProposedBelief(proposalId);

      // Send notification to the proposer
      try {
        await pushNotificationToUser(proposal.proposedBy, {
          actor: req.user?.id as string,
          type: 'belief_approved',
          beliefName: proposal.beliefName,
          message: `Your belief card proposal "${proposal.beliefName}" has been approved!`
        });
      } catch (error) {
        console.error(`Failed to send approval notification to ${proposal.proposedBy}:`, error);
        // Continue even if notification fails
      }

      res.json({ 
        success: true, 
        message: `Belief "${proposal.beliefName}" approved and added to ${proposal.category}` 
      });
    } catch (error) {
      console.error('Error approving belief:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to approve belief', 
        details: errorMessage 
      });
    }
  }
);

// Endpoint to reject a proposed belief card (only for admins)
router.post(
  '/api/reject-belief',
  ensureAdminAuthenticated,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { proposalId } = req.body as { proposalId?: number };

    if (!proposalId || typeof proposalId !== 'number') {
      res.status(400).json({ error: 'proposalId is required and must be a number' });
      return;
    }

    try {
      const proposal = await removeProposedBelief(proposalId);
      
      if (!proposal) {
        res.status(404).json({ error: 'Proposal not found' });
        return;
      }

      // Send notification to the proposer
      try {
        await pushNotificationToUser(proposal.proposedBy, {
          actor: req.user?.id as string,
          type: 'belief_rejected',
          beliefName: proposal.beliefName,
          message: `Your belief card proposal "${proposal.beliefName}" has been rejected.`
        });
      } catch (error) {
        console.error(`Failed to send rejection notification to ${proposal.proposedBy}:`, error);
        // Continue even if notification fails
      }

      res.json({ 
        success: true, 
        message: `Proposal "${proposal.beliefName}" rejected` 
      });
    } catch (error) {
      console.error('Error rejecting belief:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to reject proposal', 
        details: errorMessage 
      });
    }
  }
);

// Endpoint to delete a belief card (only for admins)
router.post(
  '/api/delete-belief',
  ensureAdminAuthenticated,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req: Request, res: Response) => {
    const { category, beliefName } = req.body as { category?: string; beliefName?: string };

    if (!category || !beliefName) {
      res.status(400).json({ error: 'category and beliefName are required' });
      return;
    }

    if (typeof category !== 'string' || typeof beliefName !== 'string') {
      res.status(400).json({ error: 'category and beliefName must be strings' });
      return;
    }

    try {
      const beliefsData = readBeliefs();

      // Check if category exists
      if (!beliefsData[category]) {
        res.status(404).json({ error: `Category "${category}" not found` });
        return;
      }

      // Find and remove the belief
      const categoryBeliefs = beliefsData[category] as Array<{ name: string }>;
      const beliefIndex = categoryBeliefs.findIndex(b => b.name === beliefName);
      if (beliefIndex === -1) {
        res.status(404).json({ error: `Belief "${beliefName}" not found in category "${category}"` });
        return;
      }

      // Remove the belief from the array
      categoryBeliefs.splice(beliefIndex, 1);

      // Save beliefs.json
      await saveBeliefs(beliefsData);

      res.json({ 
        success: true, 
        message: `Belief "${beliefName}" deleted from "${category}"` 
      });
    } catch (error) {
      console.error('Error deleting belief:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to delete belief', 
        details: errorMessage 
      });
    }
  }
);

export default router;

