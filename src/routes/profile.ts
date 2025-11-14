// src/routes/profile.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { ensureAuthenticatedOptional } from '../utils/authUtils.js';
import { getUserBio, getUserByUsername } from '../utils/userUtils.js';

const router: express.Router = express.Router();

// Redirect /profile to /profile/:username if logged in
router.get('/profile', ensureAuthenticatedOptional, (req: Request, res: Response) => {
  if (req.user?.id) {
    res.redirect(`/${req.user.id}`);
  } else {
    res.redirect('/');
  }
});

router.get(
  '/:username',
  (_req: Request, _res: Response, next: NextFunction) => {
    next();
  },
  ensureAuthenticatedOptional,
  async (req: Request, res: Response, next: NextFunction) => {
    const profileUserId = req.params.username;
    if (!profileUserId) {
      res.redirect('/');
      return;
    }

    if (!await getUserByUsername(profileUserId)) {
      next();
      return;
    }

    const userBio = await getUserBio(profileUserId);

    res.render('profile', {
      title: profileUserId === req.user?.id ? 'Your Beliefs' : `${profileUserId}'s Beliefs`,
      user: req.user || {},
      profileUserId,
      userBio,
    });
  }
);

export default router;

