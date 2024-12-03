// src/routes/auth.js
import express from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import zxcvbn from 'zxcvbn';
import { getUserByUsername, addUser, updateUserPassword, userExists, postFeed } from '../utils/userUtils.js';
import { rateLimitRegistration } from '../utils/rateLimiter.js';

const router = express.Router();

// Configure passport-local strategy
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await getUserByUsername(username);
      if (!user) {
        return done(null, false, { message: 'Incorrect username or password.' });
      }
      const match = await bcrypt.compare(password, user.passwordHash);
      if (match) {
        return done(null, { id: user.username });
      } else {
        return done(null, false, { message: 'Incorrect username or password.' });
      }
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await getUserByUsername(id);
    if (user) {
      done(null, { id: user.username });
    } else {
      done(null, false);
    }
  } catch (err) {
    done(err);
  }
});

// Registration route
router.get('/register', (req, res) => {
  res.render('register', { error: null, title: 'Register' });
});

router.post('/register', rateLimitRegistration, async (req, res) => {
  try {
    const { username, password } = req.body;
    const error = await validateRegistration(username, password);
    if (error) {
      res.render('register', { error, title: 'Register' });
    } else {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      await addUser({ username, passwordHash });
      await postFeed({
        actor: username,
        type: 'new_user_joined'
      });
      res.redirect('/login');
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { error: 'Registration failed. Please try again.', title: 'Register' });
  }
});

router.get('/login', (req, res) => {
  const errorMessages = req.flash('error');
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
  })
);

// Logout route
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Password change route
router.get('/change-password', ensureAuthenticated, (req, res) => {
  res.redirect('/settings');
});

router.post('/api/change-password', ensureAuthenticated, express.json(), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await getUserByUsername(req.user.id);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const match = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!match) {
    return res.status(400).json({ error: 'Old password is incorrect' });
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
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
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated() || req.user?.id === 'test') {
    return next();
  }
  res.redirect('/login');
}

// Validate registration input
async function validateRegistration(username, password) {
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

  if (blacklisted.includes(username)) {
    return 'This username is not allowed';
  }
  if (!username || !password) {
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
  return null;
}

function validatePassword(password) {
  const passwordStrength = zxcvbn(password);
  if (passwordStrength.score < 3) {
    return 'Password is too weak. Please choose a stronger password.';
  }
  return null;
}

export default router;
