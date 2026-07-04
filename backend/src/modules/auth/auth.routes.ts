import { Router } from "express";
import type { Request, RequestHandler } from "express";
import passport from "passport";

import authController from "./auth.controller.js";

import {
  protect,
} from "../../shared/middlewares/auth.middleware.js";

import { authLimiter } from "../../shared/security/authRateLimit.js";
import { loginRateLimit } from "../../shared/security/loginLimit.js";
import { cache } from "../../shared/cache/cache.middleware.js";

/* =====================================================
   ROUTER
===================================================== */

const router = Router();

/* =====================================================
   🔐 AUTH ROUTES
===================================================== */

/**
 * REGISTER
 */
router.post(
  "/register",
  authLimiter as RequestHandler,
  authController.register as RequestHandler
);

/**
 * LOGIN
 */
router.post(
  "/login",
  loginRateLimit as RequestHandler,
  authController.login as RequestHandler
);

/**
 * GOOGLE OAUTH — START
 * Redirects the browser to Google's consent screen.
 * session: false because we issue our own JWT cookies afterward,
 * same as normal email/password login — no server-side session needed.
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }) as RequestHandler
);

/**
 * GOOGLE OAUTH — CALLBACK
 * Google redirects here after the user approves access. Passport
 * verifies the profile (see passport.ts), attaches it
 * to req.user, then authController.googleCallback exchanges it for
 * our own JWT cookies and redirects into the app.
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || "https://app.situsrevenue.com"}/login?error=google_auth_failed`,
  }) as RequestHandler,
  authController.googleCallback as RequestHandler
);

/**
 * REFRESH TOKEN (🔥 IMPORTANT ADD)
 */
router.post(
  "/refresh",
  authController.refresh as RequestHandler
);

/**
 * LOGOUT
 */
router.post(
  "/logout",
  protect as RequestHandler,
  authController.logout as RequestHandler
);

/* =====================================================
   🔒 PROTECTED ROUTES
===================================================== */

/**
 * PROFILE CACHE (per user)
 * Uses the globally-augmented req.user (express.d.ts), so we don't
 * need a separate AuthRequest type. Stringify _id since it can be
 * an ObjectId.
 */
const profileCache: RequestHandler = cache(
  (req: Request) => {
    const user =
      req.user as { id?: string; _id?: { toString(): string } | string } | undefined;
    const id =
      typeof user?.id === "string"
        ? user.id
        : user?._id
        ? String(user._id)
        : "unknown";
    return "me:" + id;
  },
  { ttl: 30 }
);

/**
 * GET PROFILE
 */
router.get(
  "/me",
  protect as RequestHandler,
  profileCache,
  authController.getProfile as RequestHandler
);

export default router;








