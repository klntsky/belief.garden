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

const PROPOSAL_RATE_LIMIT = Number(process.env.PROPOSAL_RATE_LIMIT || 10);
const PROPOSAL_RATE_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

const registrationCache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60 }); // 30 days in seconds
const chatCache = new NodeCache({ stdTTL: Math.ceil(CHAT_RATE_WINDOW / 1000) }); // TTL matches the rate window
const proposalCache = new NodeCache({ stdTTL: Math.ceil(PROPOSAL_RATE_WINDOW / 1000) }); // TTL matches the rate window

type RateLimiterConfig = {
  limit: number;
  windowMs: number;
  keyPrefix: string;
  cache: NodeCache;
  errorMessage: string;
};

type RateLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => void;

function createUserRateLimiter(config: RateLimiterConfig): RateLimiterMiddleware {
  const { limit, windowMs, keyPrefix, cache, errorMessage } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.id as string | undefined;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const key = `${keyPrefix}:${userId}`;
    const now = Date.now();
    const userHistory = (cache.get(key) as number[] | undefined) || [];

    // Remove entries older than the rate window
    const recentEntries = userHistory.filter(timestamp => now - timestamp < windowMs);

    if (recentEntries.length >= limit) {
      const oldestEntry = recentEntries[0];
      if (oldestEntry === undefined) {
        res.status(429).json({
          error: errorMessage,
          timeUntilNext: Math.ceil(windowMs / 1000)
        });
        return;
      }

      const timeUntilNext = windowMs - (now - oldestEntry);
      res.status(429).json({
        error: errorMessage,
        timeUntilNext: Math.ceil(timeUntilNext / 1000)
      });
      return;
    }

    // Add current timestamp
    recentEntries.push(now);
    cache.set(key, recentEntries);
    next();
  };
}

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
export const chatRateLimiter: RateLimiterMiddleware = createUserRateLimiter({
  limit: CHAT_RATE_LIMIT,
  windowMs: CHAT_RATE_WINDOW,
  keyPrefix: 'chat',
  cache: chatCache,
  errorMessage: 'Rate limit exceeded',
});

// Belief proposal-related rate limiter middleware
export const proposalRateLimiter: RateLimiterMiddleware = createUserRateLimiter({
  limit: PROPOSAL_RATE_LIMIT,
  windowMs: PROPOSAL_RATE_WINDOW,
  keyPrefix: 'proposal',
  cache: proposalCache,
  errorMessage: 'Proposal rate limit exceeded. Please try again later.',
});


