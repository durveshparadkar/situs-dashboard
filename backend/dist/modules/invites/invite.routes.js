// invite.routes.ts
import { Router, } from "express";
import mongoose from "mongoose";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { protect, authorize, } from "../../shared/middlewares/auth.middleware.js";
import { requireActiveBilling } from "../../shared/billing/billing.guard.js";
import { redis } from "../../config/redis.js";
import { dbLogger } from "../../utils/logger.js";
import { createInvite, acceptInvite, getInvites, revokeInvite, resendInvite, } from "./invite.controller.js";
const router = Router();
/* =====================================================
   HELPERS
===================================================== */
/**
 * Async wrapper — forwards rejections to global error middleware.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
/**
 * MongoDB ObjectId param validator — rejects malformed IDs at the route layer
 * before they hit the controller or DB.
 */
const validateObjectId = (paramName) => (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
            success: false,
            error: {
                code: "INVALID_ID",
                message: `Invalid ${paramName} format`,
            },
        });
        return;
    }
    next();
};
/**
 * Extract a stable user identity from req.user (typed via global augmentation).
 * Handles both id (string) and _id (ObjectId | string).
 */
function getUserId(req) {
    const u = req.user;
    if (!u)
        return "";
    if (typeof u.id === "string" && u.id)
        return u.id;
    if (u._id)
        return u._id.toString();
    return "";
}
/* =====================================================
   RATE LIMITERS
   Three tiers — different abuse vectors require different limits.
===================================================== */
/** Create invite — 10/hr per user. Prevents spamming a victim's inbox. */
const createInviteLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl_invite_create",
    points: 10,
    duration: 3_600, // 1 hour
    blockDuration: 3_600, // continue blocking for 1h after limit hit
});
/** Accept invite — 20/15min per IP. Prevents token brute-forcing. */
const acceptInviteLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl_invite_accept",
    points: 20,
    duration: 900, // 15 min
    blockDuration: 900,
});
/** Resend invite — 5/hr per user. Prevents email-bomb abuse via resends. */
const resendInviteLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl_invite_resend",
    points: 5,
    duration: 3_600,
    blockDuration: 3_600,
});
/** Generic read endpoints — generous limit for dashboard polling. */
const readLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl_invite_read",
    points: 120,
    duration: 60, // 1 min
});
/**
 * Build a rate-limit middleware from a configured limiter.
 * Sets standard rate-limit response headers so frontend can show
 * "X/10 invites used, resets in 47m".
 */
function rateLimitMiddleware(limiter, options) {
    return async (req, res, next) => {
        try {
            let key;
            if (options.keyFrom === "user") {
                const userId = getUserId(req);
                if (!userId) {
                    res.status(401).json({
                        success: false,
                        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
                    });
                    return;
                }
                key = userId;
            }
            else {
                /* IP-based — strip x-forwarded-for proxy chain to first hop */
                const xff = req.headers["x-forwarded-for"];
                const forwardedFor = Array.isArray(xff) ? xff[0] : xff;
                const ip = (typeof forwardedFor === "string" && forwardedFor.split(",")[0]?.trim()) ||
                    req.ip ||
                    "unknown";
                key = ip;
            }
            const result = await limiter.consume(key);
            /* Set standard rate-limit response headers */
            res.set({
                "X-RateLimit-Limit": String(limiter.points),
                "X-RateLimit-Remaining": String(result.remainingPoints),
                "X-RateLimit-Reset": new Date(Date.now() + result.msBeforeNext).toISOString(),
            });
            next();
        }
        catch (err) {
            /* RateLimiterRes thrown when limit is exceeded */
            if (err instanceof RateLimiterRes) {
                const retryAfterSeconds = Math.ceil(err.msBeforeNext / 1000);
                res.set({
                    "Retry-After": String(retryAfterSeconds),
                    "X-RateLimit-Limit": String(limiter.points),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": new Date(Date.now() + err.msBeforeNext).toISOString(),
                });
                dbLogger.warn(`Rate limit exceeded: limiter=${options.name} ` +
                    `keyFrom=${options.keyFrom}`);
                res.status(429).json({
                    success: false,
                    error: {
                        code: "RATE_LIMIT_EXCEEDED",
                        message: "Too many requests. Please try again later.",
                        retryAfterSeconds,
                    },
                });
                return;
            }
            /* Unexpected error — likely Redis is down. Fail OPEN to avoid breaking
               the entire invite flow when the rate limiter has issues. Log loudly
               so ops can see the rate limiter is degraded. */
            dbLogger.error(`Rate limiter ${options.name} failed (failing open): ` +
                `${err.message}`);
            next();
        }
    };
}
/* =====================================================
   IMPORTED MIDDLEWARE — TYPE BRIDGES
   These shared middlewares were authored with a narrower local AuthRequest
   interface. Until that's migrated to the global type, bridge them via
   RequestHandler casts so Express's overload resolution works correctly.
===================================================== */
const protectMw = protect;
const requireActiveBillingMw = requireActiveBilling;
/* authorize() expects a strict Permission union — cast at call site via this typed alias.
   Once auth.middleware.ts is migrated to the global type, this can become:
     const authorizeMw = authorize;
*/
const authorizeMw = authorize;
/* =====================================================
   GLOBAL MIDDLEWARE
===================================================== */
/* Every invite route requires authentication */
router.use(protectMw);
/* =====================================================
   ROUTES
===================================================== */
/**
 * @route   POST /invites
 * @desc    Create a new invite
 * @access  Authenticated + CREATE_INVITE + active billing
 * @rateLimit 10/hour per user
 */
router.post("/", authorizeMw("CREATE_INVITE"), requireActiveBillingMw, rateLimitMiddleware(createInviteLimiter, {
    keyFrom: "user",
    name: "create_invite",
}), createInvite);
/**
 * @route   POST /invites/accept
 * @desc    Accept an invite using a token
 * @access  Authenticated
 * @rateLimit 20/15min per IP (prevents token brute-forcing)
 */
router.post("/accept", rateLimitMiddleware(acceptInviteLimiter, {
    keyFrom: "ip",
    name: "accept_invite",
}), acceptInvite);
/**
 * @route   GET /invites
 * @desc    List org invites with pagination and status filtering
 * @access  Authenticated + READ_INVITE
 * @query   page, limit, status (active|used|revoked|expired|all)
 */
router.get("/", authorizeMw("READ_INVITE"), rateLimitMiddleware(readLimiter, {
    keyFrom: "user",
    name: "list_invites",
}), getInvites);
/**
 * @route   POST /invites/:id/resend
 * @desc    Resend an invite email; refreshes token if expired
 * @access  Authenticated + CREATE_INVITE + active billing
 * @rateLimit 5/hour per user
 */
router.post("/:id/resend", authorizeMw("CREATE_INVITE"), requireActiveBillingMw, validateObjectId("id"), rateLimitMiddleware(resendInviteLimiter, {
    keyFrom: "user",
    name: "resend_invite",
}), resendInvite);
/**
 * @route   POST /invites/:id/revoke
 * @desc    Revoke a pending invite
 * @access  Authenticated + REVOKE_INVITE + active billing
 */
router.post("/:id/revoke", authorizeMw("REVOKE_INVITE"), requireActiveBillingMw, validateObjectId("id"), revokeInvite);
export default router;
//# sourceMappingURL=invite.routes.js.map