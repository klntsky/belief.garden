// src/routes/profile.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { ensureAuthenticatedOptional } from '../utils/authUtils.js';
import {
  getUserBeliefs,
  getUserBio,
  getUserByUsername,
  isValidUsername,
} from '../utils/userUtils.js';
import { readBeliefs } from '../readBeliefs.js';

const router: express.Router = express.Router();
const validChoices = new Set(['reject', 'neutral', 'support']);

function getPublicOrigin(req: Request): string {
  const configuredOrigin = process.env.PUBLIC_SITE_URL?.trim();
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

// Redirect /profile to /profile/:username if logged in
router.get('/profile', ensureAuthenticatedOptional, (req: Request, res: Response) => {
  if (req.user?.id) {
    res.redirect(`/${req.user.id}`);
  } else {
    res.redirect('/');
  }
});

router.get(
  '/:username/guess',
  ensureAuthenticatedOptional,
  async (req: Request, res: Response, next: NextFunction) => {
    const profileUserId = req.params.username;
    if (!profileUserId || !isValidUsername(profileUserId)) {
      next();
      return;
    }

    try {
      if (!await getUserByUsername(profileUserId)) {
        next();
        return;
      }

      const userBeliefs = await getUserBeliefs(profileUserId);
      const beliefDefinitions = readBeliefs();
      const beliefNames = new Set(
        Object.values(beliefDefinitions).flatMap(category => (
          category.map(belief => belief.name)
        )),
      );
      const beliefCount = Object.entries(userBeliefs).filter(([name, belief]) => (
        beliefNames.has(name) && validChoices.has(belief.choice || '')
      )).length;
      const publicOrigin = getPublicOrigin(req);
      const canonicalUrl = `${publicOrigin}/${encodeURIComponent(profileUserId)}/guess`;

      res.render('guess', {
        title: `Guess @${profileUserId}'s Beliefs | belief.garden`,
        user: req.user || {},
        profileUserId,
        beliefCount,
        canonicalUrl,
        robots: beliefCount > 0 ? 'index,follow,max-image-preview:large' : 'noindex,follow',
        socialImageUrl: `${publicOrigin}/static/guess-preview.png`,
      });
    } catch (error) {
      next(error);
    }
  }
);

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

    if (!isValidUsername(profileUserId)) {
      next();
      return;
    }

    try {
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
    } catch (error) {
      next(error);
    }
  }
);

export default router;
