// src/app.ts

import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import passport from 'passport';
import dotenv from 'dotenv';
import expressLayouts from 'express-ejs-layouts';
import indexRouter from './routes/index.js';
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import apiRouter from './routes/api.js';
import FileStore from 'session-file-store';
import { promises as fs } from 'fs';
import { updateUsersJson } from './utils/updateUsers.js';

dotenv.config();

const app = express();

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('layout', 'layout'); // Set default layout
app.use(expressLayouts);

// Serve static files with appropriate caching
app.use(
  express.static('public', {
    etag: true, // Enable ETag header generation
    lastModified: true, // Enable Last-Modified header
    setHeaders: (res: Response, filePath: string) => {
      if (filePath.endsWith('.webp')) {
        // For image files that rarely change, set a long cache duration
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
      } else {
        // For other static files, set must-revalidate to ensure updated files are fetched
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  })
);

app.use(express.urlencoded({ extended: false }));

// app.use((req, res, next) => {
//   if (req.headers['cf-connecting-ip']) {
//     req.ip = req.headers['cf-connecting-ip'];
//   }
//   next();
// });
// Configure session store
const fileStoreOptions = {};
const FileStoreSession = FileStore(session);

app.use(
  session({
    store: new FileStoreSession(fileStoreOptions),
    secret: process.env.SESSION_SECRET || 'default-secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

// Middleware to make `user` available in all views
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.user = req.user;
  next();
});

app.use('/', indexRouter);
app.use('/', authRouter);
app.use('/', apiRouter);
app.use('/', profileRouter);

// 404 Page
app.use((_req: Request, res: Response) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Ensure all required data directories exist
const requiredDirs = [
  'data/accounts',
  'data/bans',
  'data/bio',
  'data/comments',
  'data/debates',
  'data/users',
  'data/settings',
  'data/notifications',
  'data/followers',
  'data/follows'
];

Promise.all(
  requiredDirs.map(dir => fs.mkdir(dir, { recursive: true }))
).then(() => {
  const port = process.env.PORT || '3000';
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    
    // Start periodic user statistics updates
    // Default interval: 5 minutes (300000 ms)
    // Can be configured via UPDATE_USERS_INTERVAL_MS environment variable
    const updateInterval = parseInt(process.env.UPDATE_USERS_INTERVAL_MS || '300000', 10);
    
    // Run immediately on startup
    console.log('Running initial user statistics update...');
    updateUsersJson();
    
    // Then run periodically
    setInterval(() => {
      console.log('Running periodic user statistics update...');
      updateUsersJson();
    }, updateInterval);
    
    console.log(`User statistics will update every ${updateInterval / 1000} seconds`);
  });
}).catch((err: unknown) => {
  console.error('Error creating data directories:', err);
  process.exit(1);
});

