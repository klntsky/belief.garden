// src/utils/authUtils.ts
import { type Request, type Response, type NextFunction } from 'express';
import { isAdmin } from './adminUtils.js';

// For non-API routes (renders HTML)
export async function ensureAdminAuthenticatedPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated()) {
    res.redirect('/login');
    return;
  }
  
  const userIsAdmin = await isAdmin(req.user?.id as string);
  if (!userIsAdmin) {
    res.status(403).send('Access denied. This page is only available to administrators.');
    return;
  }
  
  next();
}

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    next();
    return;
  }
  res.redirect('/login');
}

export function ensureAuthenticatedApi(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export function ensureAuthenticatedOptional(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

export async function ensureAdminAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  const userIsAdmin = await isAdmin(req.user?.id as string);
  if (!userIsAdmin) {
    res.status(403).json({ error: 'Access denied. Only administrators can access this resource.' });
    return;
  }
  
  next();
}

