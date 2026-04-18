import { Router, Request, Response, NextFunction } from "express";
import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";
import { requireActiveBilling } from "../../shared/billing/billing.guard.js";

import {
  createInvite,
  acceptInvite,
  getInvites,
  revokeInvite,
} from "./invite.controller.js";

import { RateLimiterRedis } from "rate-limiter-flexible";
import { redis } from "../../config/redis.js";

const router = Router();

/* =====================================================
   🔒 INVITE RATE LIMITER (10 per hour per user)
===================================================== */

const inviteLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_invite",
  points: 10,
  duration: 3600, // 1 hour
});

const inviteRateLimit = async (
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    await inviteLimiter.consume(req.user._id.toString());
    next();
  } catch (err: any) {
    if (err?.remainingPoints === 0 || err?.msBeforeNext) {
      return res.status(429).json({
        success: false,
        message: "Invite limit exceeded. Try again later.",
      });
    }

    console.error("Invite rate limit error:", err);
    return res.status(500).json({
      success: false,
      message: "Rate limiter error",
    });
  }
};

/* =====================================================
   ROUTES
===================================================== */

/* -------------------------------
   CREATE INVITE (Paid + Limited)
-------------------------------- */
router.post(
  "/",
  protect,
  authorize("CREATE_INVITE"),
  requireActiveBilling,
  inviteRateLimit,
  createInvite
);

/* -------------------------------
   ACCEPT INVITE (Authenticated)
-------------------------------- */
router.post(
  "/accept",
  protect,
  acceptInvite
);

/* -------------------------------
   LIST INVITES
-------------------------------- */
router.get(
  "/",
  protect,
  authorize("READ_INVITE"),
  getInvites
);

/* -------------------------------
   REVOKE INVITE
-------------------------------- */
router.post(
  "/:id/revoke",
  protect,
  authorize("REVOKE_INVITE"),
  requireActiveBilling,
  revokeInvite
);

export default router;






