import rateLimit from "express-rate-limit";
import { RateLimiterRedis } from "rate-limiter-flexible";
import type { Request, Response, NextFunction } from "express";
import { redis } from "../../config/redis.js";

/* =====================================================
   MEMORY LIMITER (Fallback)
===================================================== */

const memoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
});

/* =====================================================
   REDIS LIMITER (Primary)
===================================================== */

let redisLimiter: RateLimiterRedis | null = null;

try {
  redisLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl_global",
    points: 100,   // 100 requests
    duration: 60,  // per 60 seconds
  });
} catch {
  redisLimiter = null;
}

/* =====================================================
   GLOBAL LIMITER (AUTO SELECT)
===================================================== */

export const globalLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (redisLimiter) {
    try {
      await redisLimiter.consume(req.ip ?? "unknown");
      return next();
    } catch {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Slow down.",
      });
    }
  }

  // Fallback to memory limiter if Redis unavailable
  return memoryLimiter(req, res, next);
};
