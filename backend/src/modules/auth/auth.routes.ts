import { Router } from "express";
import type { RequestHandler } from "express";

import {
  register,
  login,
  getProfile,
} from "./auth.controller.js";

import { protect } from "../../shared/middlewares/auth.middleware.js";
import { authLimiter } from "../../shared/security/authRateLimit.js";
import { bruteForceGuard } from "../../shared/security/bruteForce.js";
import { cache } from "../../shared/cache/cache.middleware.js";
import { loginRateLimit } from "../../shared/security/loginLimit.js";

const router = Router();

/* =====================================================
   🔐 AUTH ROUTES
===================================================== */

// 🛡 Public routes (Protected with Rate + Brute Guard)

router.post(
  "/register",
  authLimiter as RequestHandler,
  register as RequestHandler
);

router.post(
  "/login",
  authLimiter as RequestHandler,
  loginRateLimit as RequestHandler,
  bruteForceGuard as RequestHandler,
  login as RequestHandler
);

/* =====================================================
   🔒 PROTECTED ROUTES
===================================================== */

const profileCache: RequestHandler = cache(
  (req) => {
    const user = (req as any).user;
    return 'me:${user?._id ?? "unknown"}';
  },
  30
);

router.get(
  "/me",
  protect as RequestHandler,
  profileCache,
  getProfile as RequestHandler
);

export default router;








