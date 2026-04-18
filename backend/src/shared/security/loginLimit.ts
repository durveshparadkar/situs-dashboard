import { RateLimiterRedis } from "rate-limiter-flexible";
import { redis } from "../../config/redis.js";
import { Request, Response, NextFunction } from "express";

const loginLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_login",
  points: 5,      // 5 attempts
  duration: 60,   // per minute per IP
  blockDuration: 300, // block for 5 minutes if exceeded
});

export const loginRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await loginLimiter.consume(req.ip || "unknown");
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many login attempts. Try again later.",
    });
  }
};
