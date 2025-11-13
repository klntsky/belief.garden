// src/routes/api.js

import express from 'express';
import path from 'path';
import { ensureAuthenticatedApi } from '../utils/authUtils.js';
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
import { promises as fs } from 'fs';

const debatesDir = path.join('data', 'debates');
const bansDir = path.join('data', 'bans');

const COMMENT_MAX_LENGTH = 400;
const JSON_SIZE_LIMIT = '100kb';
const MAX_CHAT_MENTION_USERNAMES = 3;

const router = express.Router();

// Route to get user beliefs
router.get('/api/user-beliefs/:userId', (req, res) => {
  const requestedUserId = req.params.userId;
  const userBeliefsFilePath = getUserBeliefsFilePath(requestedUserId);

  // Resolve the absolute path to prevent directory traversal attacks
  const absolutePath = path.resolve(userBeliefsFilePath);

  // Send the file directly
  res.sendFile(absolutePath, (err) => {
    if (err) {
      console.error('Error sending user beliefs file:', err);
      res
        .status(err.status || 500)
        .json({ error: 'User beliefs not found.' });
    }
  });
});

function ellipsis(text, maxLength) {
  if (text.length > maxLength) {
    return text.slice(0, maxLength - 3) + '...';
  }
  return text;
}

// Only authenticated users can edit their own beliefs
router.put(
  '/api/user-beliefs/:userId/:beliefName',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req, res) => {
    const beliefName = req.params.beliefName;
    const authenticatedUserId = req.user.id;

    if (req.params.userId !== authenticatedUserId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const beliefData = req.body;

    try {
      const result = await withUserBeliefs(authenticatedUserId, async () => {
        const userBeliefs = await getUserBeliefs(authenticatedUserId);

        if (!userBeliefs[beliefName]) {
          userBeliefs[beliefName] = {};
        }

        const oldChoice = userBeliefs[beliefName]?.choice;

        if ('choice' in beliefData) {
          if (beliefData.choice === null) {
            delete userBeliefs[beliefName].choice;
          } else {
            userBeliefs[beliefName].choice = beliefData.choice;
          }
        }

        const oldComment = userBeliefs[beliefName]?.comment;

        if ('comment' in beliefData) {
          if (beliefData.comment.length > COMMENT_MAX_LENGTH) {
            throw new Error(`Comment should be no longer than ${COMMENT_MAX_LENGTH} characters.`);
          }
          if (beliefData.comment === '') {
            delete userBeliefs[beliefName].comment;
            delete userBeliefs[beliefName].commentTime;
          } else {
            userBeliefs[beliefName].comment = beliefData.comment;
            userBeliefs[beliefName].commentTime = Date.now();
          }
        }

        // If the belief entry is empty, remove it
        if (Object.keys(userBeliefs[beliefName]).length === 0) {
          delete userBeliefs[beliefName];
        }

        await saveUserBeliefs(authenticatedUserId, userBeliefs);
        return { userBeliefs, oldChoice: oldChoice, oldComment };
      });

      res.status(200).json({ message: 'User belief updated successfully.' });

      // Post notifications outside the queue
      if ('choice' in beliefData) {
        await postFeed({
          actor: authenticatedUserId,
          type: 'choice_changed',
          beliefName,
          old_choice: result.oldChoice,
          new_choice: beliefData.choice
        });
      }

      if ('comment' in beliefData) {
        await postFeed({
          actor: authenticatedUserId,
          type: 'new_comment',
          text: ellipsis(beliefData.comment, 100),
          beliefName
        });
      }

      if ('comment' in beliefData && beliefData.comment !== '') {
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
      res.status(400)
         .json({ error: error.message || 'Internal server error.' });
    }
  }
);

// Fetch user's pie chart data
router.get('/api/user-piechart/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const userBeliefs = await getUserBeliefs(userId);

    // Extract beliefs with preference
    const piechart = {};
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
  async (req, res) => {
    const userId = req.params.userId;
    const beliefName = req.params.beliefName;
    const action = req.params.action;

    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      const updatedUserBeliefs = await adjustPieSlicePoints(
        userId,
        beliefName,
        action
      );
      const updatedPreference = updatedUserBeliefs[beliefName].preference;
      res.json({ beliefName, preference: updatedPreference });
    } catch (error) {
      console.error('Error adjusting pie slice:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Toggle favorite status
router.post(
  '/api/user-favorites/:userId/:beliefName',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  async (req, res) => {
    const userId = req.params.userId;
    const beliefName = req.params.beliefName;

    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
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
      res.status(500).json({ error: error.message });
    }
  }
);

// Get user bio
router.get('/api/user-bio/:userId', async (req, res) => {
  const userId = req.params.userId;

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
  async (req, res) => {
    const userId = req.params.userId;

    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const bioText = req.body;
    if (bioText.length > 1500) {
      return res.status(400).json({
        error: 'Bio cannot exceed 1500 characters.',
      });
    }

    try {
      const oldBio = await getUserBio(userId);
      if (oldBio.length == 0) {
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
router.get('/api/debates/:beliefName', async (req, res) => {
  const beliefName = req.params.beliefName;
  const filePath = path.join(debatesDir, `${beliefName}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
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
  async (req, res) => {
    const { userId, beliefName } = req.params;
    const { comment } = req.body;
    const authenticatedUserId = req.user.id;

    if (!comment) {
      return res.status(400).json({ error: 'Reply text is required.' });
    }

    if (comment.length > COMMENT_MAX_LENGTH) {
      return res.status(400).json({
        error: `Reply should be no longer than ${COMMENT_MAX_LENGTH} characters.`,
      });
    }

    try {
      // Check if user is banned
      const banFilePath = path.join(bansDir, `${userId}.json`);
      let bans = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8'));
        if (bans.some(ban => ban.username === req.user.id)) {
          return res.status(403).json({ error: 'You are banned from replying to this profile' });
        }
      } catch (err) {
        // If file doesn't exist, user isn't banned
        if (err.code !== 'ENOENT') throw err;
      }

      const settings = await getUserSettings(userId);

      const [reply, userBeliefs] = await withUserBeliefs(userId, async () => {
        const userBeliefs = await getUserBeliefs(userId);

        if (!userBeliefs[beliefName]) {
          throw new Error('Belief not found.');
        }

        // Check if the belief has a comment
        if (!userBeliefs[beliefName].comment) {
          throw new Error('Cannot reply to an empty comment.');
        }

        // Check if the comment contains "debate me"
        if (!settings.allowAllDebates) {
          if (!userBeliefs[beliefName].comment.toLowerCase().includes('debate me')) {
            throw new Error('Can only reply to comments that include "debate me".');
          }
        }

        // For non-owners, prevent consecutive replies
        if (authenticatedUserId !== userId) {
          const replies = userBeliefs[beliefName].replies || [];
          const lastReply = replies[replies.length - 1];
          if (lastReply && lastReply.username === authenticatedUserId) {
            throw new Error('Subsequent replies are not allowed. You can delete your last comment and send a new one.');
          }
        }

        // For own profile, check if there's at least one reply from another user
        if (userId === authenticatedUserId) {
          const hasOtherReplies = userBeliefs[beliefName].replies?.some(
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
        if (!userBeliefs[beliefName].replies) {
          userBeliefs[beliefName].replies = [];
        }

        // Add the new reply
        const newReply = {
          username: authenticatedUserId,
          comment,
          timestamp: Date.now()
        };

        userBeliefs[beliefName].replies.push(newReply);

        // Sort replies by timestamp
        userBeliefs[beliefName].replies.sort((a, b) => a.timestamp - b.timestamp);

        await saveUserBeliefs(userId, userBeliefs);
        return [newReply, userBeliefs];
      });

      // Send notifications outside the queue
      await postFeed({
        actor: authenticatedUserId,
        type: 'new_reply',
        text: comment,
        beliefName,
        profileName: userId
      });

      let notifiedFollowers = [];

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
      const allThreadParticipants = new Set(
        userBeliefs[beliefName].replies
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
      res.status(400)
         .json({ error: error.message || 'Error adding reply.' });
    }
  }
);

// Delete a reply
router.delete(
  '/api/user-beliefs/:userId/:beliefName/reply/:timestamp',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  async (req, res) => {
    const { userId, beliefName, timestamp } = req.params;
    const authenticatedUserId = req.user.id;

    try {
      await withUserBeliefs(userId, async () => {
        const userBeliefs = await getUserBeliefs(userId);

        if (!userBeliefs[beliefName] || !userBeliefs[beliefName].replies) {
          throw new Error('Belief or replies not found.');
        }

        const replyIndex = userBeliefs[beliefName].replies.findIndex(
          reply => reply.timestamp === parseInt(timestamp)
        );

        if (replyIndex === -1) {
          throw new Error('Reply not found.');
        }

        const reply = userBeliefs[beliefName].replies[replyIndex];

        // Check if user is authorized to delete the reply
        if (authenticatedUserId !== userId && authenticatedUserId !== reply.username) {
          throw new Error('Not authorized to delete this reply.');
        }

        // Remove the reply
        userBeliefs[beliefName].replies.splice(replyIndex, 1);

        await saveUserBeliefs(userId, userBeliefs);
      });

      res.status(200).json({ message: 'Reply deleted successfully.' });
    } catch (error) {
      console.error('Error deleting reply:', error);
      res.status(error.message?.includes('not found') ? 404 :
                error.message?.includes('Not authorized') ? 403 : 500)
         .json({ error: error.message || 'Error deleting reply.' });
    }
  }
);

// Ban a user from replying to a profile
router.post('/api/ban-user',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json({ limit: JSON_SIZE_LIMIT }),
  async (req, res) => {
    const { bannedUser, deleteReplies } = req.body;
    const profileOwner = req.user.id;

    if (!bannedUser) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (bannedUser === profileOwner) {
      return res.status(400).json({ error: 'Cannot ban yourself.' });
    }

    const banFilePath = path.join(bansDir, `${profileOwner}.json`);

    try {
      let bans = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
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
            if (belief.replies) {
              const originalLength = belief.replies.length;
              belief.replies = belief.replies.filter(reply => reply.username !== bannedUser);
              if (belief.replies.length !== originalLength) {
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
  async (req, res) => {
    const profileOwner = req.user.id;
    const banFilePath = path.join(bansDir, `${profileOwner}.json`);

    try {
      let bans = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
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
  async (req, res) => {
    const { bannedUser } = req.body;
    const profileOwner = req.user.id;

    if (!bannedUser) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const banFilePath = path.join(bansDir, `${profileOwner}.json`);

    try {
      let bans = [];
      try {
        bans = JSON.parse(await fs.readFile(banFilePath, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return res.json({ success: true }); // No bans file means user isn't banned
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
router.get('/api/notifications', ensureAuthenticatedApi, async (req, res) => {
  try {
    const since = parseInt(req.query.since) || 0;
    const notifications = await getUserNotifications(req.user.id);

    // Filter notifications newer than the given timestamp
    const recentNotifications = notifications.filter(n => n.timestamp > since);

    res.json(recentNotifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Check if user is following another user
router.get('/api/follow/:userId', ensureAuthenticatedApi, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const authenticatedUserId = req.user.id;

    // Can't follow yourself
    if (targetUserId === authenticatedUserId) {
      return res.status(400).json(false);
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
router.put('/api/follow/:userId', ensureAuthenticatedApi, perUserWriteLimiter, async (req, res) => {
  const userToFollow = req.params.userId;
  const follower = req.user.id;

  if (userToFollow === follower) {
    return res.status(400).json({ error: 'Cannot follow yourself.' });
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
router.delete('/api/follow/:userId', ensureAuthenticatedApi, perUserWriteLimiter, async (req, res) => {
  const userToUnfollow = req.params.userId;
  const follower = req.user.id;

  if (userToUnfollow === follower) {
    return res.status(400).json({ error: 'Cannot unfollow yourself.' });
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
router.get('/api/following', ensureAuthenticatedApi, async (req, res) => {
  try {
    const following = await getUserFollowing(req.user.id);
    res.json({ following });
  } catch (error) {
    console.error('Error getting following list:', error);
    res.status(500).json({ error: 'Failed to get following list' });
  }
});

// Settings endpoints
router.get('/api/settings', ensureAuthenticatedApi, async (req, res) => {
  try {
    const settings = await getUserSettings(req.user.id);
    res.json(settings);
  } catch (error) {
    console.error('Error getting user settings:', error);
    res.status(500).json({ error: 'Failed to get user settings' });
  }
});

router.post('/api/settings', ensureAuthenticatedApi, perUserWriteLimiter, express.json(), async (req, res) => {
  try {
    const settings = await getUserSettings(req.user.id);
    const updatedSettings = { ...settings, ...req.body };
    await saveUserSettings(req.user.id, updatedSettings);
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ error: 'Failed to save user settings' });
  }
});

router.get('/api/settings/:userId', async (req, res) => {
  try {
    const settings = await getUserSettings(req.params.userId);
    res.json(settings);
  } catch (error) {
    console.error('Error getting user settings:', error);
    res.status(500).json({ error: 'Failed to get user settings' });
  }
});

// Get global feed entries
router.get('/api/feed', async (req, res) => {
  try {
    const since = parseInt(req.query.since) || 0;
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
  async (req, res) => {
    const { message } = req.body;
    const userId = req.user.id;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    if (message.length > COMMENT_MAX_LENGTH) {
      return res.status(400).json({ error: 'Message too long' });
    }

    const mentionedUsernames = new Set(message.match(/[a-zA-Z0-9_-]{3,30}/g));

    if (mentionedUsernames.size > MAX_CHAT_MENTION_USERNAMES) {
      return res.status(400).json(
        { error: `No more than ${MAX_CHAT_MENTION_USERNAMES} user mentions per message` }
      );
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

export default router;
