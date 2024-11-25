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
  getUserBeliefsFilePath,
} from '../utils/userUtils.js';
import Bottleneck from 'bottleneck';
import { promises as fs } from 'fs';

const debatesDir = path.join('data', 'debates');

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

export default router;
