import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redis';
import { logger } from '../utils/logger';

// Custom store using Redis
class RedisStore {
  private redis: RedisService;
  private keyPrefix: string;

  constructor(keyPrefix: string = 'rate_limit:') {
    this.redis = new RedisService();
    this.keyPrefix = keyPrefix;
  }

  async increment(key: string): Promise<{ totalHits: number; timeToExpire?: number; resetTime: Date }> {
    const redisKey = `${this.keyPrefix}${key}`;
    
    try {
      const current = await this.redis.get(redisKey);
      
      if (current === null) {
        // First request
        await this.redis.set(redisKey, '1', 60); // 1 minute default
        const resetTime = new Date(Date.now() + 60000);
        return { totalHits: 1, timeToExpire: 60000, resetTime };
      } else {
        // Increment existing
        const newValue = await this.redis.incr(redisKey);
        const ttl = await this.redis.ttl(redisKey);
        const timeToExpire = ttl > 0 ? ttl * 1000 : 60000;
        const resetTime = new Date(Date.now() + timeToExpire);
        return { 
          totalHits: newValue, 
          timeToExpire,
          resetTime
        };
      }
    } catch (error) {
      logger.error('Redis rate limiter error:', error);
      // Fallback to allowing the request if Redis fails
      const resetTime = new Date(Date.now() + 60000);
      return { totalHits: 1, timeToExpire: 60000, resetTime };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.keyPrefix}${key}`;
    
    try {
      const current = await this.redis.get(redisKey);
      if (current && parseInt(current) > 0) {
        await this.redis.decr(redisKey);
      }
    } catch (error) {
      logger.error('Redis rate limiter decrement error:', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.keyPrefix}${key}`;
    
    try {
      await this.redis.del(redisKey);
    } catch (error) {
      logger.error('Redis rate limiter reset error:', error);
    }
  }
}

// Key generator function that considers user authentication
const keyGenerator = (req: Request): string => {
  // Use user ID if authenticated, otherwise use IP
  const userId = (req as any).user?.id;
  if (userId) {
    return `user:${userId}`;
  }
  
  // Get client IP (considering proxy headers)
  const forwarded = req.headers['x-forwarded-for'] as string;
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || req.ip || 'unknown';
  return `ip:${ip}`;
};

// Skip function for certain requests
const skipSuccessfulRequests = (req: Request, res: Response): boolean => {
  // Skip rate limiting for successful requests to certain endpoints
  const skipPaths = ['/health', '/api/health'];
  return skipPaths.includes(req.path) && res.statusCode < 400;
};

// Custom handler for rate limit exceeded
const rateLimitHandler = (req: Request, res: Response): void => {
  const key = keyGenerator(req);
  (logger as any).logRateLimit?.(key, req.path, req.rateLimit?.limit || 0);
  
  res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later.',
    error: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.round(req.rateLimit?.resetTime || Date.now() + 60000),
    limit: req.rateLimit?.limit,
    remaining: req.rateLimit?.remaining,
    resetTime: req.rateLimit?.resetTime
  });
};

// General rate limiter (most restrictive)
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: Request): number => {
    // Higher limits for authenticated users
    if ((req as any).user) {
      return 1000; // 1000 requests per 15 minutes for authenticated users
    }
    return 100; // 100 requests per 15 minutes for anonymous users
  },
  handler: rateLimitHandler,
  keyGenerator,
  skip: skipSuccessfulRequests,
  standardHeaders: true,
  legacyHeaders: false
});

// Auth-specific rate limiter (more restrictive for login attempts)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  handler: (req: Request, res: Response) => {
    const key = keyGenerator(req);
    (logger as any).logSecurity?.('Rate limit exceeded for auth endpoint', {
      key,
      path: req.path,
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent']
    });
    
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      error: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit?.resetTime || Date.now() + 15 * 60 * 1000)
    });
  },
  keyGenerator: (req: Request): string => {
    // For auth, always use IP to prevent account enumeration
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || req.ip || 'unknown';
    return `auth_ip:${ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Upload rate limiter (for file uploads)
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req: Request): number => {
    if ((req as any).user?.role === 'admin') {
      return 1000; // Admins get higher limits
    }
    if ((req as any).user) {
      return 100; // 100 uploads per hour for authenticated users
    }
    return 10; // 10 uploads per hour for anonymous users
  },
  handler: rateLimitHandler,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

// API rate limiter (for external API calls)
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req: Request): number => {
    if ((req as any).user?.role === 'admin') {
      return 1000; // Admins get higher limits
    }
    if ((req as any).user) {
      return 60; // 60 requests per minute for authenticated users
    }
    return 20; // 20 requests per minute for anonymous users
  },
  handler: rateLimitHandler,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

// WebSocket rate limiter (for real-time events)
export const websocketRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 events per minute
  handler: rateLimitHandler,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

// Password reset rate limiter
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  handler: (req: Request, res: Response) => {
    (logger as any).logSecurity?.('Rate limit exceeded for password reset', {
      ip: req.ip || 'unknown',
      email: req.body.email,
      userAgent: req.headers['user-agent']
    });
    
    res.status(429).json({
      success: false,
      message: 'Too many password reset attempts, please try again later.',
      error: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit?.resetTime || Date.now() + 60 * 60 * 1000)
    });
  },
  keyGenerator: (req: Request): string => {
    // Use email for password reset rate limiting
    const email = req.body.email;
    if (email) {
      return `email:${email}`;
    }
    // Fallback to IP
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || req.ip || 'unknown';
    return `ip:${ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Issue creation rate limiter
export const issueCreationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req: Request): number => {
    if ((req as any).user?.role === 'admin') {
      return 200; // Admins get higher limits
    }
    return 50; // 50 issues per hour for regular users
  },
  handler: rateLimitHandler,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});


// Webhook rate limiter (for incoming webhooks)
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 webhook events per minute
  handler: (req: Request, res: Response) => {
    (logger as any).logSecurity?.('Webhook rate limit exceeded', {
      ip: req.ip || 'unknown',
      path: req.path,
      userAgent: req.headers['user-agent'],
      headers: req.headers
    });
    
    res.status(429).json({
      success: false,
      message: 'Webhook rate limit exceeded',
      error: 'WEBHOOK_RATE_LIMIT_EXCEEDED'
    });
  },
  keyGenerator: (req: Request): string => {
    // Use source IP for webhooks
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || req.ip || 'unknown';
    return `webhook_ip:${ip}`;
  },
  standardHeaders: false, // Don't expose rate limit headers for webhooks
  legacyHeaders: false
});

// Admin rate limiter (higher limits for admin operations)
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // 2000 requests per 15 minutes for admin operations
  handler: rateLimitHandler,
  keyGenerator,
  skip: (req: Request): boolean => {
    // Only apply to admin users
    return (req as any).user?.role !== 'admin';
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Helper function to reset rate limit for a specific key
export const resetRateLimit = async (key: string, type: string = 'general'): Promise<void> => {
  try {
    const store = new RedisStore(`${type}:`);
    await store.resetKey(key);
    logger.info(`Rate limit reset for key: ${key}, type: ${type}`);
  } catch (error) {
    logger.error('Failed to reset rate limit:', error);
  }
};

// Helper function to get current rate limit status
export const getRateLimitStatus = async (key: string, type: string = 'general'): Promise<any> => {
  try {
    const redis = new RedisService();
    const redisKey = `${type}:${key}`;
    const current = await redis.get(redisKey);
    const ttl = await redis.ttl(redisKey);
    
    return {
      current: current ? parseInt(current) : 0,
      ttl: ttl > 0 ? ttl : 0,
      resetTime: ttl > 0 ? Date.now() + (ttl * 1000) : null
    };
  } catch (error) {
    logger.error('Failed to get rate limit status:', error);
    return null;
  }
};

// Middleware to add rate limit info to request object
export const addRateLimitInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const key = keyGenerator(req);
    const status = await getRateLimitStatus(key);
    
    (req as any).rateLimitInfo = status;
    next();
  } catch (error) {
    logger.error('Failed to add rate limit info:', error);
    next();
  }
};

// Configure rate limit headers
declare global {
  namespace Express {
    interface Request {
      rateLimit?: {
        limit: number;
        remaining: number;
        resetTime: number;
      };
      rateLimitInfo?: {
        current: number;
        ttl: number;
        resetTime: number | null;
      };
    }
  }
}