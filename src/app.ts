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
import { updateUsersJson } from './utils/updateUsers.js';
import path from 'path';
import { runDataMigrations } from './migrations.js';

dotenv.config();

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required but not set.');
  console.error('Please set OPENAI_API_KEY in your .env file.');
  process.exit(1);
}

// SESSION_SECRET is required in production (not in test mode)
if (process.env.NODE_ENV !== 'test' && !process.env.SESSION_SECRET) {
  console.error('Error: SESSION_SECRET environment variable is required in production.');
  console.error('Please set a secure SESSION_SECRET in your .env file.');
  console.error('Using the default secret is insecure and not allowed in production.');
  process.exit(1);
}

const app = express();

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('layout', 'layout'); // Set default layout
app.use(expressLayouts);

// Route to serve beliefs.json from data/ for frontend compatibility
// This must be before the static middleware to take precedence
app.get('/static/beliefs.json', (_req: Request, res: Response) => {
  const beliefsFilePath = path.join('data', 'beliefs.json');
  res.sendFile(path.resolve(beliefsFilePath), (err?: Error | null) => {
    if (err) {
      console.error('Error serving beliefs.json:', err);
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({ error: 'Failed to load beliefs data' });
    }
  });
});

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

runDataMigrations().then(() => {
  const port = process.env.PORT || '3000';
  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    
    // Start periodic user statistics updates
    // Default interval: 5 minutes (300000 ms)
    // Can be configured via UPDATE_USERS_INTERVAL_MS environment variable
    const updateInterval = parseInt(process.env.UPDATE_USERS_INTERVAL_MS || '300000', 10);
    
    // Run immediately on startup
    console.log('Running initial user statistics update...');
    updateUsersJson();
    
    // Store interval ID so we can clear it on shutdown
    const updateTimer = setInterval(() => {
      console.log('Running periodic user statistics update...');
      updateUsersJson();
    }, updateInterval);
    
    console.log(`User statistics will update every ${updateInterval / 1000} seconds`);
    
    // Graceful shutdown handlers
    const shutdown = () => {
      console.log('Shutting down gracefully...');
      clearInterval(updateTimer);
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      // Force exit after 10 seconds if server doesn't close
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  });
}).catch((err: unknown) => {
  console.error('Error creating data directories:', err);
  process.exit(1);
});

