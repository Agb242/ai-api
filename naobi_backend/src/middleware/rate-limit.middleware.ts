import { Context, Next } from 'koa';
import { redisClient } from '../config/redis';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxAttempts: number; // Max attempts in window
  keyPrefix: string; // Redis key prefix
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  message?: string; // Custom error message
}

/**
 * Rate limiting middleware using Redis
 */
export const rateLimit = (options: RateLimitOptions) => {
  const {
    windowMs,
    maxAttempts,
    keyPrefix,
    skipSuccessfulRequests = false,
    message = 'Trop de tentatives. Veuillez réessayer plus tard.',
  } = options;

  return async (ctx: Context, next: Next) => {
    // Get identifier (IP or user ID)
    const identifier = ctx.state.userId || ctx.ip;
    const key = `${keyPrefix}:${identifier}`;

    try {
      // Get current count
      const current = await redisClient.get(key);
      const count = current ? parseInt(current, 10) : 0;

      // Check if limit exceeded
      if (count >= maxAttempts) {
        const ttl = await redisClient.ttl(key);
        const retryAfter = Math.ceil(ttl);

        ctx.status = 429;
        ctx.set('Retry-After', retryAfter.toString());
        ctx.body = {
          error: message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter,
        };
        return;
      }

      // Increment counter
      if (current) {
        await redisClient.incr(key);
      } else {
        await redisClient.setex(key, Math.ceil(windowMs / 1000), '1');
      }

      // Continue to next middleware
      await next();

      // If skipSuccessfulRequests and request was successful, decrement
      if (skipSuccessfulRequests && ctx.status < 400) {
        await redisClient.decr(key);
      }
    } catch (error) {
      console.error('Rate limit error:', error);
      // On Redis error, allow request to proceed
      await next();
    }
  };
};

/**
 * Brute force protection for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5,
  keyPrefix: 'auth_attempts',
  skipSuccessfulRequests: true,
  message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
});

/**
 * OTP verification rate limit
 */
export const otpRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxAttempts: 5,
  keyPrefix: 'otp_attempts',
  skipSuccessfulRequests: true,
  message: 'Trop de tentatives de vérification OTP. Veuillez réessayer dans 10 minutes.',
});

/**
 * OTP generation rate limit (prevent spam)
 */
export const otpGenerationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 3,
  keyPrefix: 'otp_generation',
  message: 'Trop de demandes de code OTP. Veuillez patienter 1 minute.',
});

/**
 * General API rate limit
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 100,
  keyPrefix: 'api_requests',
  message: 'Trop de requêtes. Veuillez ralentir.',
});

export default {
  rateLimit,
  authRateLimit,
  otpRateLimit,
  otpGenerationRateLimit,
  apiRateLimit,
};
