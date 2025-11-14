// src/utils/rateLimiter.ts
import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import Bottleneck from 'bottleneck';
import { type Request, type Response, type NextFunction } from 'express';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

const RATE_LIMIT = Number(process.env.RATE_LIMIT || 3);
const CHAT_RATE_LIMIT = 2; // 2 messages per minute
const CHAT_RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds

const registrationCache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60 }); // 30 days in seconds
const chatCache = new NodeCache({ stdTTL: Math.ceil(CHAT_RATE_WINDOW / 1000) }); // TTL matches the rate window

interface LimiterWithTimestamp extends Bottleneck {
  lastUsed: number;
}

// Map to store per-user limiters with last used timestamps
const limiters: Record<string, LimiterWithTimestamp> = {};

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

export function rateLimitRegistration(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  
  const ip = req.ip;
  const key = `reg-${ip}`;
  const count = (registrationCache.get(key) as number | undefined) || 0;

  if (count >= RATE_LIMIT) {
    res.render('register', { error: 'Registration limit reached for this IP address. Please try again later.' });
  } else {
    registrationCache.set(key, count + 1);
    next();
  }
}

// Export function to clear registration cache (useful for tests)
export function clearRegistrationCache(): void {
  registrationCache.flushAll();
}

/**
 * Middleware to prevent concurrent processing of requests that write to a user's JSON file.
 * Uses Bottleneck to ensure that only one request per user is processed at a time.
 */
export function perUserWriteLimiter(req: Request, res: Response, next: NextFunction): void {
  const userId = req.params.userId;
  if (!userId) {
    next();
    return;
  }

  // Create a new limiter for the user if it doesn't exist
  if (!limiters[userId]) {
    const limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 0,
    }) as LimiterWithTimestamp;
    limiter.lastUsed = Date.now();
    limiters[userId] = limiter;
  }
  limiters[userId].lastUsed = Date.now();

  limiters[userId]
    .schedule(() => {
      return new Promise<void>((resolve, reject) => {
        // Proceed to the next middleware
        next();
        // Resolve when the response is finished or an error occurs
        res.on('finish', () => resolve());
        res.on('close', () => resolve());
        res.on('error', (err) => reject(err));
      });
    })
    .catch((err: unknown) => {
      console.error('Error in limiter schedule:', err);
      next(err as Error);
    });
}

// Chat-specific rate limiter middleware
export const chatRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const userId = req.user?.id as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const key = `chat:${userId}`;
  const now = Date.now();
  const userHistory = (chatCache.get(key) as number[] | undefined) || [];

  // Remove messages older than the rate window
  const recentMessages = userHistory.filter(timestamp => now - timestamp < CHAT_RATE_WINDOW);

  if (recentMessages.length >= CHAT_RATE_LIMIT) {
    const oldestMessage = recentMessages[0];
    if (oldestMessage === undefined) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        timeUntilNext: Math.ceil(CHAT_RATE_WINDOW / 1000)
      });
      return;
    }
    const timeUntilNext = CHAT_RATE_WINDOW - (now - oldestMessage);
    res.status(429).json({
      error: 'Rate limit exceeded',
      timeUntilNext: Math.ceil(timeUntilNext / 1000)
    });
    return;
  }

  // Add current message timestamp
  recentMessages.push(now);
  chatCache.set(key, recentMessages);
  next();
};

