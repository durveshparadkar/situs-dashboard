// rateLimit.middleware.ts
import rateLimit, {
  type RateLimitRequestHandler,
  type Options,
  ipKeyGenerator,
} from "express-rate-limit";
import type { Request, Response } from "express";

import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const RATE_LIMIT_CONFIG = {
  isDev:                process.env.NODE_ENV !== "production",
  isTest:               process.env.NODE_ENV === "test",
  trustProxy:           process.env.TRUST_PROXY === "true",

  /**
   * Whether to disable rate limiting entirely in dev.
   * Set RATE_LIMIT_ENABLE_DEV=true to enable rate limiting in dev too
   * (useful for testing the limiter itself).
   */
  enableInDev:          process.env.RATE_LIMIT_ENABLE_DEV === "true",

  /**
   * Paths that should never be rate-limited.
   * Health checks, metrics, and internal endpoints get hit constantly.
   */
  skipPaths: [
    "/health",
    "/healthz",
    "/ready",
    "/metrics",
    "/favicon.ico",
  ] as const,

  /**
   * Roles that bypass rate limiting entirely.
   * SUPER_ADMIN runs internal tooling; rate-limiting platform staff
   * mostly hurts your own ops team.
   */
  bypassRoles: ["SUPER_ADMIN"] as const,
} as const;

// ============================================================
// HELPERS
// ============================================================

/**
 * Check if a path matches any of the configured skip prefixes.
 * Prefix matching so "/health/check" also matches "/health".
 */
function pathMatches(path: string, prefixes: readonly string[]): boolean {
  for (const prefix of prefixes) {
    if (
      path === prefix ||
      path.startsWith(prefix + "/") ||
      path.startsWith(prefix + "?")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a rate-limit key for the request.
 *
 * Authenticated requests are keyed by userId — prevents one user from
 * burning through their org's IP-shared quota and locking out coworkers.
 *
 * Unauthenticated requests are keyed by IP. Uses ipKeyGenerator from
 * express-rate-limit which handles IPv6 properly (collapsing to /64 prefix
 * since each IPv6 user has access to a huge subnet).
 */
function keyByUserOrIp(req: Request): string {
  const u = req.user;

  if (u) {
    const userId =
      (typeof u.id === "string" && u.id) ||
      (u._id ? String(u._id) : "");
    if (userId) return "user:" + userId;
  }

  // ipKeyGenerator handles IPv6 collapsing correctly.
  // Falls back to a sentinel if even the IP isn't available.
  return "ip:" + (ipKeyGenerator(req.ip ?? "") || "unknown");
}

/**
 * Common skip-check logic shared by every limiter.
 * Returns true if the request should bypass rate limiting.
 */
function shouldSkip(req: Request): boolean {
  // Always skip in test environment — rate limits break test runs
  if (RATE_LIMIT_CONFIG.isTest) return true;

  // Skip in dev unless explicitly enabled
  if (RATE_LIMIT_CONFIG.isDev && !RATE_LIMIT_CONFIG.enableInDev) return true;

  // Skip configured paths (health checks etc.)
  const path = req.originalUrl || req.url || "";
  if (pathMatches(path, RATE_LIMIT_CONFIG.skipPaths)) return true;

  // Skip bypass roles (SUPER_ADMIN)
  const role = String(req.user?.role ?? "").toUpperCase();
  if (role && (RATE_LIMIT_CONFIG.bypassRoles as readonly string[]).includes(role)) {
    return true;
  }

  return false;
}

/**
 * Build the rejection handler. Logs the violation and sends a structured
 * 429 response with Retry-After hint.
 */
function buildHandler(limitName: string) {
  return (req: Request, res: Response): void => {
    const userId = req.user?.id ?? req.user?._id ?? "anon";
    const ip     = req.ip ?? "unknown";
    const path   = req.originalUrl || req.url || "";

    dbLogger.warn(
      "Rate limit exceeded: limiter=" + limitName +
      " user=" + String(userId) +
      " ip=" + ip +
      " path=" + path
    );

    // Retry-After header for compliant clients
    const retryAfter = res.getHeader("Retry-After");

    res.status(429).json({
      success: false,
      error: {
        code:    "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        limiter: limitName,
        ...(retryAfter && { retryAfter }),
      },
    });
  };
}

/**
 * Build a limiter with common defaults pre-applied. Each named limiter
 * (api, auth, write, etc.) calls this with its specific overrides.
 */
function buildLimiter(
  name: string,
  overrides: Partial<Options>
): RateLimitRequestHandler {
  const options: Partial<Options> = {
    standardHeaders: "draft-7",  // RFC 6585 + RateLimit headers
    legacyHeaders:   false,
    keyGenerator:    keyByUserOrIp,
    skip:            shouldSkip,
    handler:         buildHandler(name),

    // Validate IPv6 + trust-proxy at startup; warn rather than crash on issues
    validate: {
      trustProxy:       RATE_LIMIT_CONFIG.trustProxy,
      xForwardedForHeader: RATE_LIMIT_CONFIG.trustProxy,
      ip:               true,
      keyGeneratorIpFallback: false,
    },

    ...overrides,
  };

  return rateLimit(options);
}

// ============================================================
// LIMITER INSTANCES
// Each limiter has a name (for logging), a window, and a max.
// Tuned per use case — auth attempts get the strictest limits.
// ============================================================

/**
 * General API limiter — covers most read endpoints and standard CRUD.
 * Permissive enough that real users won't hit it; tight enough to slow
 * scrapers and bot traffic.
 */
export const apiLimiter: RateLimitRequestHandler = buildLimiter("api", {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      300,             // 300 requests per 15min per user/IP
});

/**
 * Auth limiter — applied to /login, /register, /forgot-password.
 * Strict because these are the primary credential-stuffing targets.
 * Keys by IP (since unauthenticated) — defends against attackers
 * cycling usernames from one source.
 */
export const authLimiter: RateLimitRequestHandler = buildLimiter("auth", {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      10,              // 10 attempts per 15min per IP
  // Reset on successful auth so a legitimate user isn't punished
  // for typing their password wrong once. (express-rate-limit
  // doesn't natively support this; controller can call .resetKey
  // after successful auth — see integration notes.)
});

/**
 * Password-related limiter — even tighter than general auth.
 * Applied to /forgot-password, /reset-password, change-password.
 * 5/hour stops password-reset spam attacks that flood inboxes.
 */
export const passwordLimiter: RateLimitRequestHandler = buildLimiter("password", {
  windowMs: 60 * 60 * 1000,  // 1 hour
  max:      5,               // 5 requests per hour per IP
});

/**
 * Mutation limiter — applied to write endpoints (POST/PATCH/PUT/DELETE).
 * Tighter than reads because writes have higher backend cost
 * (DB writes, queue jobs, downstream API calls).
 */
export const writeLimiter: RateLimitRequestHandler = buildLimiter("write", {
  windowMs: 60 * 1000,       // 1 minute
  max:      60,              // 60 writes per minute per user/IP
});

/**
 * Read limiter — generous, suitable for dashboard polling endpoints.
 */
export const readLimiter: RateLimitRequestHandler = buildLimiter("read", {
  windowMs: 60 * 1000,       // 1 minute
  max:      120,             // 120 reads per minute per user/IP
});

/**
 * Bulk operation limiter — strict, applied to endpoints that process
 * many items at once (bulk imports, mass updates).
 */
export const bulkLimiter: RateLimitRequestHandler = buildLimiter("bulk", {
  windowMs: 60 * 1000,       // 1 minute
  max:      5,               // 5 bulk ops per minute per user/IP
});

/**
 * Expensive operation limiter — for analytics endpoints, reports,
 * AI/LLM-backed endpoints, etc. that are CPU/cost expensive.
 */
export const expensiveLimiter: RateLimitRequestHandler = buildLimiter("expensive", {
  windowMs: 60 * 1000,       // 1 minute
  max:      10,              // 10 expensive ops per minute per user/IP
});

// ============================================================
// CUSTOM LIMITER FACTORY
// For routes needing a one-off limit that doesn't fit the presets.
// ============================================================

export interface CustomLimiterOptions {
  /** Time window in ms. */
  windowMs: number;
  /** Max requests per window per key. */
  max:      number;
  /** Optional name for logging (defaults to "custom"). */
  name?:    string;
}

/**
 * Build a custom rate limiter with the project's standard defaults
 * (skip logic, key generator, handler, etc.) applied automatically.
 *
 * Usage:
 *   const myLimit = createRateLimiter({ windowMs: 60_000, max: 30 });
 *   router.post("/expensive", myLimit, handler);
 */
export function createRateLimiter(
  opts: CustomLimiterOptions
): RateLimitRequestHandler {
  return buildLimiter(opts.name ?? "custom", {
    windowMs: opts.windowMs,
    max:      opts.max,
  });
}

export default apiLimiter;
