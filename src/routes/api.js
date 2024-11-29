// src/routes/api.js

import express from 'express';
import path from 'path';
import { ensureAuthenticatedApi } from '../utils/authUtils.js';
import {
  getUserBeliefs,
  saveUserBeliefs,
  toggleUserFavorite,
  adjustPieSlicePoints,
  getUserBio,
  saveUserBio,
  getUserSettings,
  saveUserSettings,
  getUserBeliefsFilePath,
} from '../utils/userUtils.js';
import Bottleneck from 'bottleneck';
import { promises as fs } from 'fs';

const debatesDir = path.join('data', 'debates');
const bansDir = path.join('data', 'bans');

const COMMENT_MAX_LENGTH = 400;
const router = express.Router();

// Map to store per-user limiters
const limiters = {};

/**
 * Middleware to prevent concurrent processing of requests that write to a user's JSON file.
 * Uses Bottleneck to ensure that only one request per user is processed at a time.
 */
function perUserWriteLimiter(req, res, next) {
  const userId = req.params.userId;
  if (!userId) {
    return next();
  }

  // Create a new limiter for the user if it doesn't exist
  if (!limiters[userId]) {
    limiters[userId] = new Bottleneck({
      maxConcurrent: 1,
      minTime: 0,
    });
  }

  limiters[userId]
    .schedule(() => {
      return new Promise((resolve, reject) => {
        // Proceed to the next middleware
        next();
        // Resolve when the response is finished or an error occurs
        res.on('finish', resolve);
        res.on('close', resolve);
        res.on('error', reject);
      });
    })
    .catch((err) => {
      console.error('Error in limiter schedule:', err);
      next(err);
    });
}

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

// Only authenticated users can edit their own beliefs
router.put(
  '/api/user-beliefs/:userId/:beliefName',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json(),
  async (req, res) => {
    const requestedUserId = req.params.userId;
    const beliefName = req.params.beliefName;
    const authenticatedUserId = req.user.id;

    if (requestedUserId !== authenticatedUserId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const beliefData = req.body;
    let userBeliefs;
    try {
      userBeliefs = await getUserBeliefs(requestedUserId);
    } catch (error) {
      console.error('Error fetching user beliefs:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }

    if (!userBeliefs[beliefName]) {
      userBeliefs[beliefName] = {};
    }

    if ('choice' in beliefData) {
      if (beliefData.choice === null) {
        delete userBeliefs[beliefName].choice;
      } else {
        userBeliefs[beliefName].choice = beliefData.choice;
      }
    }

    if ('comment' in beliefData) {
      if (beliefData.comment.length > COMMENT_MAX_LENGTH) {
        return res.status(400).json({
          error: `Comment should be no longer than ${COMMENT_MAX_LENGTH} characters.`,
        });
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

    try {
      await saveUserBeliefs(requestedUserId, userBeliefs);
      res.status(200).json({ message: 'User belief updated successfully.' });
    } catch (error) {
      console.error('Error saving user beliefs:', error);
      res.status(500).json({ error: 'Internal server error.' });
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
  express.json(),
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

      const userBeliefs = await getUserBeliefs(userId);

      if (!userBeliefs[beliefName]) {
        return res.status(404).json({ error: 'Belief not found.' });
      }

      // Check if the belief has a comment
      if (!userBeliefs[beliefName].comment) {
        return res.status(400).json({ error: 'Cannot reply to an empty comment.' });
      }

      const settings = await getUserSettings(userId);

      // Check if the comment contains "debate me"
      if (!settings.allowAllDebates) {
        if (!userBeliefs[beliefName].comment.toLowerCase().includes('debate me')) {
          return res.status(400).json({ error: 'Can only reply to comments that include "debate me".' });
        }
      }

      // For non-owners, prevent consecutive replies
      if (authenticatedUserId !== userId) {
        const replies = userBeliefs[beliefName].replies || [];
        const lastReply = replies[replies.length - 1];
        if (lastReply && lastReply.username === authenticatedUserId) {
          return res.status(400).json({ error: 'Subsequent replies are not allowed. You can delete your last comment and send a new one.' });
        }
      }

      // For own profile, check if there's at least one reply from another user
      if (userId === authenticatedUserId) {
        const hasOtherReplies = userBeliefs[beliefName].replies?.some(
          reply => reply.username !== authenticatedUserId
        );
        if (!hasOtherReplies) {
          return res.status(400).json({ error: 'Cannot reply until someone else replies first.' });
        }
      }

      // Check reply length
      const lines = comment.split('\n');
      if (lines.length > 20) {
        return res.status(400).json({ error: 'Reply cannot be longer than 20 lines.' });
      }

      // Initialize replies array if it doesn't exist
      if (!userBeliefs[beliefName].replies) {
        userBeliefs[beliefName].replies = [];
      }

      // Add the new reply
      const reply = {
        username: authenticatedUserId,
        comment,
        timestamp: Date.now()
      };

      userBeliefs[beliefName].replies.push(reply);

      // Sort replies by timestamp
      userBeliefs[beliefName].replies.sort((a, b) => a.timestamp - b.timestamp);

      await saveUserBeliefs(userId, userBeliefs);
      res.status(200).json(reply);
    } catch (error) {
      console.error('Error adding reply:', error);
      res.status(500).json({ error: 'Error adding reply.' });
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
      const userBeliefs = await getUserBeliefs(userId);

      if (!userBeliefs[beliefName] || !userBeliefs[beliefName].replies) {
        return res.status(404).json({ error: 'Belief or replies not found.' });
      }

      const replyIndex = userBeliefs[beliefName].replies.findIndex(
        reply => reply.timestamp === parseInt(timestamp)
      );

      if (replyIndex === -1) {
        return res.status(404).json({ error: 'Reply not found.' });
      }

      const reply = userBeliefs[beliefName].replies[replyIndex];

      // Check if user is authorized to delete the reply
      if (authenticatedUserId !== userId && authenticatedUserId !== reply.username) {
        return res.status(403).json({ error: 'Not authorized to delete this reply.' });
      }

      // Remove the reply
      userBeliefs[beliefName].replies.splice(replyIndex, 1);

      await saveUserBeliefs(userId, userBeliefs);
      res.status(200).json({ message: 'Reply deleted successfully.' });
    } catch (error) {
      console.error('Error deleting reply:', error);
      res.status(500).json({ error: 'Error deleting reply.' });
    }
  }
);

// Ban a user from replying to a profile
router.post('/api/ban-user',
  ensureAuthenticatedApi,
  perUserWriteLimiter,
  express.json(),
  async (req, res) => {
    const { bannedUser, deleteReplies } = req.body;
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
      }
    
      if (!bans.some(ban => ban.username === bannedUser)) {
        bans.push({ username: bannedUser });
        await fs.writeFile(banFilePath, JSON.stringify(bans, null, 2));
      }

      // Delete all replies by the banned user if requested
      if (deleteReplies) {
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
  express.json(),
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

router.post('/api/settings', ensureAuthenticatedApi, express.json(), async (req, res) => {
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

router.get('/api/settings/:userId', ensureAuthenticatedApi, async (req, res) => {
  try {
    const settings = await getUserSettings(req.params.userId);
    res.json(settings);
  } catch (error) {
    console.error('Error getting user settings:', error);
    res.status(500).json({ error: 'Failed to get user settings' });
  }
});

export default router;
