// src/routes/index.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { ensureAuthenticated, ensureAdminAuthenticatedPage } from '../utils/authUtils.js';
import { getUserByUsername, deleteUserAccount, getUserSettings } from '../utils/userUtils.js';
import { readBeliefs } from '../readBeliefs.js';
import { getProposedBeliefs } from '../utils/proposedBeliefsUtils.js';

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
router.get('/feed', async (req, res) => {
  try {
    const usersFile = path.join('public', 'users.json');
    const usersData = JSON.parse(await fs.promises.readFile(usersFile, 'utf8'));
    const usernames = usersData.map(user => user.username).slice(0, 5);
    res.render('feed', { user: req.user, usernames });
  } catch (error) {
    console.error('Error loading usernames:', error);
    res.render('feed', { user: req.user, usernames: [] });
  }
});

// Notifications page
router.get('/notifications', ensureAuthenticated, async (req, res) => {
  res.render('notifications', {
    user: req.user,
    settings: await getUserSettings(req.user.id)
  });
});

// Propose belief card page
router.get('/propose', ensureAuthenticated, (req, res) => {
  const beliefsData = readBeliefs();
  const categories = Object.keys(beliefsData).sort();
  const selectedCategory = req.query.category || '';
  
  res.render('propose', {
    user: req.user,
    title: 'Propose Belief Card',
    categories: categories,
    selectedCategory: selectedCategory
  });
});

// Admin page for reviewing proposed beliefs (only for admins)
router.get('/admin/proposed', ensureAdminAuthenticatedPage, async (req, res) => {
  try {
    const proposedBeliefs = await getProposedBeliefs();
    const beliefsData = readBeliefs();
    const categories = Object.keys(beliefsData).sort();

    res.render('admin-proposed', {
      user: req.user,
      title: 'Review Proposed Beliefs',
      proposedBeliefs: proposedBeliefs,
      categories: categories
    });
  } catch (error) {
    console.error('Error loading proposed beliefs:', error);
    res.status(500).send('An error occurred while loading proposed beliefs.');
  }
});

// Admin panel (main admin page)
router.get('/admin', ensureAdminAuthenticatedPage, (req, res) => {
  res.render('admin', {
    user: req.user,
    title: 'Admin Panel'
  });
});

// Admin page for deleting beliefs (only for admins)
router.get('/admin/delete-belief', ensureAdminAuthenticatedPage, async (req, res) => {
  try {
    const beliefsData = readBeliefs();
    const categories = Object.keys(beliefsData).sort();

    res.render('admin-delete-belief', {
      user: req.user,
      title: 'Delete Belief Card',
      categories: categories,
      beliefsData: beliefsData
    });
  } catch (error) {
    console.error('Error loading delete belief page:', error);
    res.status(500).send('An error occurred while loading the delete belief page.');
  }
});

export default router;
