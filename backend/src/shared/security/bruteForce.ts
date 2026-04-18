import { RateLimiterMemory } from "rate-limiter-flexible";

export const loginBruteLimiter = new RateLimiterMemory({
  points: 5,       // 5 failed attempts
  duration: 60 * 15, // 15 minutes lock
});

export const bruteForceGuard = async (req: any, res: any, next: any) => {
  try {
    await loginBruteLimiter.consume(req.ip);
    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many failed attempts. Try again later.",
    });
  }
};
