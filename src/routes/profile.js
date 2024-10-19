// src/routes/profile.js
import express from 'express';
import { ensureAuthenticatedOptional } from '../utils/authUtils.js';
import { getUserBio, getUserByUsername } from '../utils/userUtils.js';

const router = express.Router();

// Redirect /profile to /profile/:username if logged in
router.get('/profile', ensureAuthenticatedOptional, (req, res) => {
  res.redirect(`/${req.user.id}`);
});

router.get(
  '/:username',
  (req, res, next) => {
    next();
  },
  ensureAuthenticatedOptional,
  async (req, res, next) => {
    const profileUserId = req.params.username;
    if (!profileUserId) {
      return res.redirect('/');
    }

    if (!getUserByUsername(profileUserId)) {
      next();
      return;
    }

    const userBio = getUserBio(profileUserId);

    res.render('profile', {
      title: profileUserId === req.user?.id ? 'Your Beliefs' : `${profileUserId}'s Beliefs`,
      user: req.user || {},
      profileUserId,
      userBio,
    });
  }
);

export default router;
