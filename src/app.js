// src/app.js
import express from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import passport from 'passport';
import dotenv from 'dotenv';
import expressLayouts from 'express-ejs-layouts';
import indexRouter from './routes/index.js';
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import apiRouter from './routes/api.js';

dotenv.config();

const app = express();

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('layout', 'layout'); // Set default layout
app.use(expressLayouts);
// Serve static files with caching
app.use(
  express.static('public', {
    maxAge: '30d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.webp')) {
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days in seconds
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

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

// Middleware to make `user` available in all views
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

app.use('/', indexRouter);
app.use('/', authRouter);
app.use('/', apiRouter);
app.use('/', profileRouter);

// 404 Page
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
