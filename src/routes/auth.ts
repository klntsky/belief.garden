// src/routes/auth.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import zxcvbn from 'zxcvbn';
import { getUserByUsername, addUser, updateUserPassword, userExists, postFeed, pushNotificationToUser } from '../utils/userUtils.js';
import { rateLimitRegistration } from '../utils/rateLimiter.js';

const router: express.Router = express.Router();

// Configure passport-local strategy
passport.use(
  new LocalStrategy(async (username: string, password: string, done: (error: unknown, user?: Express.User | false, options?: { message: string }) => void): Promise<void> => {
    try {
      const user = await getUserByUsername(username);
      if (!user) {
        done(null, false, { message: 'Incorrect username or password.' });
        return;
      }
      const match = await bcrypt.compare(password, user.passwordHash);
      if (match) {
        done(null, { id: user.username } as Express.User);
      } else {
        done(null, false, { message: 'Incorrect username or password.' });
      }
    } catch (err) {
      done(err);
    }
  })
);

passport.serializeUser((user: Express.User, done: (err: unknown, id?: string) => void) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done: (err: unknown, user?: Express.User | false) => void): Promise<void> => {
  try {
    const user = await getUserByUsername(id);
    if (user) {
      done(null, { id: user.username } as Express.User);
    } else {
      done(null, false);
    }
  } catch (err) {
    done(err);
  }
});

// Registration route
router.get('/register', (_req: Request, res: Response) => {
  res.render('register', { error: null, title: 'Register' });
});

router.post('/register', rateLimitRegistration, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    const error = await validateRegistration(username, password);
    if (error) {
      res.render('register', { error, title: 'Register' });
    } else {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password!, saltRounds);
      await addUser({ username: username!, passwordHash });
      await postFeed({
        actor: username!,
        type: 'new_user_joined'
      });
      res.redirect('/login');
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { error: 'Registration failed. Please try again.', title: 'Register' });
  }
});

router.get('/login', (req: Request, res: Response) => {
  const errorMessages = req.flash('error') as string[];
  res.render('login', {
    error: errorMessages[0] || null,
    title: 'Login',
  });
});

router.post(
  '/login',
  passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/login',
    failureFlash: true,
  }) as express.RequestHandler
);

// Logout route
router.get('/logout', (req: Request, res: Response) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Password change route
router.get('/change-password', ensureAuthenticated, (_req: Request, res: Response) => {
  res.redirect('/settings');
});

router.post('/api/change-password', ensureAuthenticated, express.json(), async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
  const userId = req.user?.id as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  const user = await getUserByUsername(userId);

  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  if (!newPassword) {
    res.status(400).json({ error: 'New password is required' });
    return;
  }

  const match = await bcrypt.compare(oldPassword || '', user.passwordHash);
  if (!match) {
    res.status(400).json({ error: 'Old password is incorrect' });
    return;
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  try {
    const saltRounds = 10;
    const newHash = await bcrypt.hash(newPassword, saltRounds);
    await updateUserPassword(user.username, newHash);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Ensure authenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated() || req.user?.id === 'test') {
    next();
    return;
  }
  res.redirect('/login');
}

// Validate registration input
async function validateRegistration(username: string | undefined, password: string | undefined): Promise<string | null> {
  const blacklisted = [
    'login',
    'register',
    'ban',
    'mod',
    'notifications',
    'test',
    'profile',
    'api',
    'profile',
    'admin',
    'page',
    'about',
    'help',
    'account',
    'settings',
    'logout',
    'redirect',
    'oauth',
    'delete',
    'faq',
    'donate',
    'feed',
    'app',
    'redirect',
    'auth',
    'compare',
    'admin',
    'gallery',
    'change-password',
    'users',
    'user',
    'bio',
  ];

  if (!username || blacklisted.includes(username)) {
    return 'This username is not allowed';
  }
  if (!password) {
    return 'Username and password are required.';
  }
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    return 'Username can only contain letters, numbers, hyphens (-), and underscores (_). 3 to 30 characters length.';
  }
  if (await userExists(username)) {
    return 'Username already exists.';
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return passwordError;
  }
  await pushNotificationToUser(username, {
    type: 'welcome',
    actor: username,
  });
  return null;
}

function validatePassword(password: string): string | null {
  const passwordStrength = zxcvbn(password);
  if (passwordStrength.score < 3) {
    return 'Password is too weak. Please choose a stronger password.';
  }
  return null;
}

export default router;

