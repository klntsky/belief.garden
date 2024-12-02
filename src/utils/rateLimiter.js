// src/utils/rateLimiter.js
import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import Bottleneck from 'bottleneck';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

const RATE_LIMIT = (process.env.RATE_LIMIT || 3) * 1;

const registrationCache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60 }); // 30 days in seconds

// Map to store per-user limiters with last used timestamps
const limiters = {};

// Cleanup inactive limiters periodically
const LIMITER_CLEANUP_INTERVAL = 3600000; // 1 hour
const LIMITER_INACTIVE_THRESHOLD = 3600000; // 1 hour

setInterval(() => {
  const now = Date.now();
  Object.entries(limiters).forEach(([userId, limiter]) => {
    if (now - limiter.lastUsed > LIMITER_INACTIVE_THRESHOLD) {
      delete limiters[userId];
    }
  });
}, LIMITER_CLEANUP_INTERVAL);

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

/**
 * Middleware to prevent concurrent processing of requests that write to a user's JSON file.
 * Uses Bottleneck to ensure that only one request per user is processed at a time.
 */
export function perUserWriteLimiter(req, res, next) {
  const userId = req.params.userId;
  if (!userId) {
    return next();
  }

  // Create a new limiter for the user if it doesn't exist
  if (!limiters[userId]) {
    limiters[userId] = new Bottleneck({
      maxConcurrent: 1,
      minTime: 0,
    });
  }
  limiters[userId].lastUsed = Date.now();

  limiters[userId]
    .schedule(() => {
      return new Promise((resolve, reject) => {
        // Proceed to the next middleware
        next();
        // Resolve when the response is finished or an error occurs
        res.on('finish', resolve);
        res.on('close', resolve);
        res.on('error', reject);
      });
    })
    .catch((err) => {
      console.error('Error in limiter schedule:', err);
      next(err);
    });
}
