// src/utils/authUtils.js
import { isAdmin } from './adminUtils.js';

// For non-API routes (renders HTML)
export async function ensureAdminAuthenticatedPage(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  
  const userIsAdmin = await isAdmin(req.user.id);
  if (!userIsAdmin) {
    return res.status(403).send('Access denied. This page is only available to administrators.');
  }
  
  next();
}

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

export async function ensureAdminAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const userIsAdmin = await isAdmin(req.user.id);
  if (!userIsAdmin) {
    return res.status(403).json({ error: 'Access denied. Only administrators can access this resource.' });
  }
  
  next();
}
