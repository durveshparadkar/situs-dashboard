import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { Request, Response } from "express";

/* =====================================================
   🚀 API RATE LIMITER (Production Ready)
===================================================== */

export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes

  max: 300, // 300 requests per IP per window

  standardHeaders: true,  // RateLimit-* headers
  legacyHeaders: false,   // Disable X-RateLimit-* headers

  validate: {
    trustProxy: false, // prevents warning if trust proxy not set
  },

  skip: (req: Request) => {
    // Skip health checks
    return req.originalUrl === "/health";
  },

  handler: (_req: Request, res: Response) => {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later.",
    });
  },
});
