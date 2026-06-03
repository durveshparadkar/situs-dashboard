// globalLimiter.ts
//
// Application-wide rate limiter — applied at the app level to protect
// against catastrophic abuse (DDoS, scrapers, runaway clients). Loose
// enough that legitimate users never hit it, strict enough to stop
// pathological traffic.
//
// This is the OUTERMOST rate-limit layer. Per-route limiters (apiLimiter,
// authLimiter, etc.) provide finer-grained protection on top of this.
//
// Used by:
//   - app.ts — applied globally via app.use(globalLimiter)
//
// Different from:
//   - authLimiter      — strict, auth endpoints only
//   - bruteForceGuard  — failure counting, /login only
//   - apiLimiter       — per-endpoint API limits

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, RequestHandler } from "express";

import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const GLOBAL_LIMITER_CONFIG = {
  /**
   * Window size — 15 minutes. Long enough to smooth out brief bursts,
   * short enough to recover from accidental triggers.
   */
  windowMs: 15 * 60 * 1000,

  /**
   * Max requests per key per window.
   * Production: 1000 — generous; a normal user does ~5-50 requests/min
   *              during active use, so 1000/15min = ~70/min sustained
   * Development: 5000 — even looser for local iteration
   *
   * If legitimate users hit this in production, your real problem is
   * either a frontend with runaway polling or a misbehaving integration.
   */
  maxProd: parseInt(process.env.GLOBAL_LIMITER_MAX ?? "1000", 10),
  maxDev:  parseInt(process.env.GLOBAL_LIMITER_MAX_DEV ?? "5000", 10),

  /**
   * Whether to enforce in development. Default off because dev iteration
   * with hot-reload + many API calls can hit limits quickly.
   * Opt-in via GLOBAL_LIMITER_ENABLE_DEV=true.
   */
  enableInDev: process.env.GLOBAL_LIMITER_ENABLE_DEV === "true",

  /**
   * Paths skipped entirely from rate limiting. Health checks must always
   * pass through so load balancers can detect node liveness.
   */
  skipPaths: [
    "/health",
    "/healthz",
    "/ready",
    "/live",
    "/metrics",
    "/favicon.ico",
  ] as const,

  /**
   * Roles that bypass the global limiter. SUPER_ADMIN is platform-staff
   * who may legitimately make heavy programmatic calls (debugging,
   * support, scripts).
   */
  bypassRoles: ["SUPER_ADMIN"] as const,

  /**
   * Skip in test mode so test suites aren't blocked.
   */
  skipInTest: process.env.NODE_ENV === "test",
} as const;

const isDev  = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";

// ============================================================
// HELPERS
// ============================================================

/**
 * Extract a stable identifier for the requester.
 *
 * Strategy:
 *   1. Authenticated user → "user:<userId>" — every user gets their
 *      own bucket (multiple users on shared IPs don't interfere)
 *   2. Unauthenticated → "ip:<ipKeyGenerator(req.ip)>" — IPv6-collapsed
 *      so attackers can't rotate through /64 blocks
 *
 * User-aware keying matters: an office of 50 employees behind one IP
 * would otherwise share a single 1000/15min bucket. With user keying,
 * each authenticated user gets their own.
 */
function buildKey(req: Request): string {
  const userId =
    (req.user && typeof req.user.id === "string" && req.user.id) ||
    (req.user?._id ? String(req.user._id) : null);

  if (userId) {
    return "user:" + userId;
  }

  // Unauthenticated — key by IP with IPv6 collapse
  const ipPart = ipKeyGenerator(req.ip ?? "unknown");
  return "ip:" + ipPart;
}

/**
 * Get a stable request identifier for log correlation.
 */
function getRequestId(req: Request): string {
  const reqWithId = req as Request & { requestId?: string };
  return reqWithId.requestId ?? "";
}

/**
 * Get user role for bypass check.
 */
function getNormalizedRole(req: Request): string {
  return String(req.user?.role ?? "").trim().toUpperCase();
}

/**
 * Check whether the limiter should skip this request entirely.
 */
function shouldSkip(req: Request): boolean {
  // CORS preflight — never rate-limit OPTIONS
  if (req.method === "OPTIONS") return true;

  // Health and infrastructure paths
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  if ((GLOBAL_LIMITER_CONFIG.skipPaths as readonly string[]).includes(path)) {
    return true;
  }

  // Test mode
  if (GLOBAL_LIMITER_CONFIG.skipInTest) return true;

  // Dev mode (unless explicitly enabled)
  if (isDev && !GLOBAL_LIMITER_CONFIG.enableInDev) return true;

  // Bypass roles — platform staff with legitimate heavy use
  const role = getNormalizedRole(req);
  if ((GLOBAL_LIMITER_CONFIG.bypassRoles as readonly string[]).includes(role)) {
    return true;
  }

  return false;
}

// ============================================================
// LIMITER INSTANCE
// ============================================================

const memoryLimiter = rateLimit({
  windowMs: GLOBAL_LIMITER_CONFIG.windowMs,

  max: isDev ? GLOBAL_LIMITER_CONFIG.maxDev : GLOBAL_LIMITER_CONFIG.maxProd,

  // RFC 6585 draft-7 standard headers
  standardHeaders: "draft-7",
  legacyHeaders:   false,

  /**
   * User-aware keying. Authenticated users get their own bucket;
   * unauthenticated requests share by IP (with IPv6 collapse).
   */
  keyGenerator: buildKey,

  /**
   * Skip conditions consolidated into shouldSkip helper.
   */
  skip: shouldSkip,

  /**
   * Structured 429 response. Frontend pattern-matches on code and
   * can render a countdown using retryAfter.
   */
  handler: (req: Request, res: Response): void => {
    const retryAfterHeader = res.getHeader("Retry-After");
    const retryAfter =
      typeof retryAfterHeader === "string"
        ? parseInt(retryAfterHeader, 10)
        : typeof retryAfterHeader === "number"
          ? retryAfterHeader
          : Math.ceil(GLOBAL_LIMITER_CONFIG.windowMs / 1000);

    const key = buildKey(req);

    dbLogger.warn(
      "Global rate limit hit: " +
      "key=" + key +
      " method=" + req.method +
      " path=" + (req.originalUrl ?? req.url ?? "") +
      " retryAfter=" + retryAfter + "s" +
      (getRequestId(req) ? " requestId=" + getRequestId(req) : "")
    );

    res.status(429).json({
      success: false,
      error: {
        code:       "RATE_LIMITED",
        message:    "Too many requests. Please slow down.",
        retryAfter,
      },
    });
  },
});

// ============================================================
// EXPORT
// ============================================================

/**
 * Application-wide rate limiter. Apply at the top of your middleware
 * chain so global limits enforce before per-route limiters.
 *
 * Usage:
 *   app.set("trust proxy", 1);  // REQUIRED for correct IP detection
 *   app.use(globalLimiter);     // OUTERMOST layer
 *   app.use("/api", apiRoutes); // Per-route limits applied inside
 *
 * Order matters: globalLimiter checks happen before any controller
 * runs, so spam traffic gets rejected without consuming downstream
 * resources.
 */
export const globalLimiter: RequestHandler = memoryLimiter;

export default globalLimiter;
