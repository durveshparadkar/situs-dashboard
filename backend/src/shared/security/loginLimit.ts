// loginRateLimit.ts
//
// SHORT-WINDOW burst protection for /login. Catches rapid-fire attacks
// (5 attempts in 60s) before authLimiter would react (15-min window).
//
// This is the FIRST line of defense in the login chain:
//   1. loginRateLimit  (1-min burst window)    ← this file
//   2. authLimiter     (15-min sustained window)
//   3. bruteForceGuard (failure-only counting + long block)
//
// All three apply to the same /login route. Different attack patterns,
// different mechanisms, layered defense.
//
// IMPORTANT: ensure this is genuinely needed. authLimiter's 10/15min
// also catches 5-in-60s bursts. Consider whether you really need this
// layer or whether two limiters (authLimiter + bruteForceGuard) suffice.

import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, NextFunction, RequestHandler } from "express";

import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const LOGIN_BURST_CONFIG = {
  /**
   * Max attempts in the burst window.
   * Production: 5 — strict enough to stop scripted bursts.
   * Development: 100 — loose enough for normal iteration.
   */
  pointsProd: parseInt(process.env.LOGIN_BURST_POINTS ?? "5", 10),
  pointsDev:  parseInt(process.env.LOGIN_BURST_POINTS_DEV ?? "100", 10),

  /** Burst window in seconds — 60 = 1 minute */
  windowSeconds: parseInt(process.env.LOGIN_BURST_WINDOW_SECONDS ?? "60", 10),

  /**
   * Block duration after threshold crossed (seconds).
   * Production: 300 (5 min) — short enough to forgive typo bursts,
   *             long enough to deter scripted retry loops.
   */
  blockSecondsProd: parseInt(process.env.LOGIN_BURST_BLOCK_SECONDS ?? "300", 10),
  blockSecondsDev:  parseInt(process.env.LOGIN_BURST_BLOCK_SECONDS_DEV ?? "5", 10),

  /**
   * Skip enforcement in dev. Opt-in via LOGIN_BURST_ENABLE_DEV=true
   * to test rate-limit behavior locally.
   */
  enableInDev: process.env.LOGIN_BURST_ENABLE_DEV === "true",

  /** Max email length to defend against pathological inputs */
  maxEmailLength: 200,
} as const;

const isDev  = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";

// ============================================================
// LIMITER INSTANCE
// ============================================================

const loginBurstLimiter = new RateLimiterMemory({
  keyPrefix:     "rl_login_burst",
  points:        isDev ? LOGIN_BURST_CONFIG.pointsDev : LOGIN_BURST_CONFIG.pointsProd,
  duration:      LOGIN_BURST_CONFIG.windowSeconds,
  blockDuration: isDev ? LOGIN_BURST_CONFIG.blockSecondsDev : LOGIN_BURST_CONFIG.blockSecondsProd,
});

// ============================================================
// HELPERS
// ============================================================

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "anonymous";
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.length === 0) return "anonymous";
  return cleaned.slice(0, LOGIN_BURST_CONFIG.maxEmailLength);
}

/**
 * FNV-1a hash — fast, non-cryptographic.
 * Protects against plaintext email leakage in keys/logs, not
 * against adversarial attack on the key itself.
 */
function hashEmail(email: string): string {
  if (email === "anonymous") return "anon";
  let hash = 2166136261;
  for (let i = 0; i < email.length; i++) {
    hash ^= email.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Build composite key from IP (IPv6-collapsed via ipKeyGenerator)
 * and hashed email. Same keying strategy as authLimiter and
 * bruteForceGuard — consistent across the auth surface.
 */
function buildKey(req: Request): string {
  const ipPart   = ipKeyGenerator(req.ip ?? "unknown");
  const rawEmail = typeof req.body?.email === "string" ? req.body.email : undefined;
  const emailHash = hashEmail(normalizeEmail(rawEmail));
  return ipPart + ":" + emailHash;
}

function getRequestId(req: Request): string {
  const reqWithId = req as Request & { requestId?: string };
  return reqWithId.requestId ?? "";
}

function shouldSkip(req: Request): boolean {
  if (isTest) return true;
  if (isDev && !LOGIN_BURST_CONFIG.enableInDev) return true;
  if (req.method === "OPTIONS") return true;
  return false;
}

// ============================================================
// MIDDLEWARE
// ============================================================

/**
 * Short-window burst limiter for /login. Consumes a point on every
 * request (not just failures). Catches scripted retry loops before
 * the longer-window limiters react.
 *
 * Usage:
 *   router.post("/login",
 *     loginRateLimit,      // burst (this file)
 *     authLimiter,         // sustained window
 *     bruteForceGuard,     // failure counting
 *     loginController
 *   );
 *
 * Note: consume-on-every-request differs from bruteForceGuard's
 * consume-on-failure-only semantic. The two are complementary, not
 * redundant — together they detect both "fast spam" and "patient
 * guessing" patterns.
 */
export const loginRateLimit: RequestHandler = async (
  req:  Request,
  res:  Response,
  next: NextFunction
) => {
  if (shouldSkip(req)) {
    next();
    return;
  }

  const key = buildKey(req);

  try {
    await loginBurstLimiter.consume(key, 1);
    next();
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      const retryAfter = Math.ceil(err.msBeforeNext / 1000);

      dbLogger.warn(
        "Login burst limit hit: " +
        "key=" + key +
        " retryAfter=" + retryAfter + "s" +
        " path=" + (req.originalUrl ?? "") +
        (getRequestId(req) ? " requestId=" + getRequestId(req) : "")
      );

      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        success: false,
        error: {
          code:       "RATE_LIMITED",
          message:    "Too many login attempts. Please wait a moment before trying again.",
          retryAfter,
        },
      });
      return;
    }

    // Unknown error — fail open. A broken limiter blocking all logins
    // is worse than briefly permitting bursts.
    dbLogger.error(
      "Login burst limiter error: " +
      ((err as Error)?.message ?? "unknown") +
      " — failing open"
    );
    next();
  }
};

export default loginRateLimit;
