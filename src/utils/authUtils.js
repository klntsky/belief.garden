// src/utils/authUtils.js

export function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

export function ensureAuthenticatedApi(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export function ensureAuthenticatedOptional(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  next();
}
