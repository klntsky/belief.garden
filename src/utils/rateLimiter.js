// src/utils/rateLimiter.js
import NodeCache from 'node-cache';
import dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

const RATE_LIMIT = (process.env.RATE_LIMIT || 3) * 1;

const registrationCache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60 }); // 30 days in seconds

export function rateLimitRegistration(req, res, next) {
  const ip = req.ip;
  const key = `reg-${ip}`;
  const count = registrationCache.get(key) || 0;

  if (count >= RATE_LIMIT) {
    res.render('register', { error: 'Registration limit reached for this IP address. Please try again later.' });
  } else {
    registrationCache.set(key, count + 1);
    next();
  }
}
