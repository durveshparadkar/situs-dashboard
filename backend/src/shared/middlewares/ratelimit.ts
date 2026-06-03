import rateLimit from "express-rate-limit";

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // 🚀 increase limit
  max: 1000,

  // ✅ don't block aggressively
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Slow down.",
  },
});