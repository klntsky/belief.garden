// src/routes/index.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { ensureAuthenticated } from '../utils/authUtils.js';
import { getUserByUsername, deleteUserAccount, getUserSettings } from '../utils/userUtils.js';

dotenv.config();

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE) || 100;

const router = express.Router();

router.get('/', async (req, res) => {
  const usersFilePath = path.join('public', 'users.json');
  let usernames = [];

  if (await fs.existsSync(usersFilePath)) {
    const data = await fs.promises.readFile(usersFilePath, 'utf8');
    const usersData = JSON.parse(data);
    usernames = usersData.map(user => user.username)
      .sort(_ => Math.random() - 0.5);
  }

  res.render('index', { title: 'belief.garden', usernames });
});

router.get('/settings', ensureAuthenticated, async (req, res) => {
  const settings = await getUserSettings(req.user.id);
  res.render('settings', {
    title: 'Settings',
    settings,
    user: req.user,
  });
});

router.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  try {
    const userBeliefsDir = path.join('data', 'users');
    const files = await fs.promises.readdir(userBeliefsDir);
    const usernames = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.basename(file, '.json'));

    // Implement pagination
    const totalUsers = usernames.length;
    const totalPages = Math.ceil(totalUsers / PAGE_SIZE);
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, totalUsers);

    const paginatedUsernames = usernames.slice(startIndex, endIndex);

    res.render('users', {
      title: 'Users',
      usernames: paginatedUsernames,
      currentPage: page,
      totalPages: totalPages,
      user: req.user,
    });
  } catch (err) {
    console.error('Error reading user profiles:', err);
    res.status(500).send('An error occurred while fetching users.');
  }
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

// Ban page route
router.get('/ban', ensureAuthenticated, (req, res) => {
  res.render('ban', {
    isAuthenticated: req.isAuthenticated(),
    username: req.user?.id || null
  });
});

// Feed page
router.get('/feed', (req, res) => {
  res.render('feed', { user: req.user });
});

export default router;
