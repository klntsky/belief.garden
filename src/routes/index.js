// src/routes/index.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { ensureAuthenticated } from '../utils/authUtils.js';
import { getUserByUsername, deleteUserAccount } from '../utils/userUtils.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const usersFilePath = path.join('public', 'users.json');
  let usernames = [];

  if (await fs.existsSync(usersFilePath)) {
    const data = await fs.promises.readFile(usersFilePath, 'utf8');
    const usersData = JSON.parse(data);
    usernames = usersData.map(user => user.username);
  }

  res.render('index', { title: 'belief.garden', usernames });
});

// Gallery route
router.get('/gallery', (req, res) => {
  const isAuthenticated = req.isAuthenticated();
  const username = req.user?.id || '';
  res.render('gallery', {
    isAuthenticated,
    username,
    title: 'Gallery',
  });
});

router.get('/faq', (req, res) => {
  res.render('faq', { user: req.user, title: 'belief.garden' });
});

// GET route to display the account deletion confirmation form
router.get('/delete', ensureAuthenticated, (req, res) => {
  res.render('delete', { user: req.user, error: null });
});

// POST route to handle account deletion
router.post('/delete', ensureAuthenticated, express.urlencoded({ extended: false }), async (req, res) => {
  const { password } = req.body;
  const username = req.user.id;

  try {
    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(400).send('User not found.');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.render('delete', { error: 'Incorrect password.', user: req.user });
    }

    // Delete user account
    await deleteUserAccount(username);

    // Log out the user
    req.logout(() => {
      res.redirect('/');
    });
  } catch (error) {
    console.error('Error deleting user account:', error);
    res.status(500).send('An error occurred while deleting your account.');
  }
});

export default router;
