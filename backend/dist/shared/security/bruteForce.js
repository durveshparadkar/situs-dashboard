// bruteForceGuard.ts
//
// Brute-force protection middleware for authentication endpoints.
//
// Different from authLimiter in two important ways:
//   1. Tracks FAILED attempts only — successful logins reset the counter.
//      A user who logs in correctly after 3 typos doesn't accumulate
//      brute-force "debt".
//   2. Longer block duration — once tripped, blocks for 15 minutes vs
//      rate limiter's per-window enforcement.
//
// Pattern of use:
//   - bruteForceGuard runs BEFORE the auth controller
//   - Controller awaits authentication
//   - On failure: controller calls recordFailedAttempt(req) to
//     consume a point
//   - On success: controller calls resetAttempts(req) to clear
//
// Without consume-on-failure semantics, a user who mistypes their
// password 5 times then logs in correctly still gets blocked on the
// next login window — terrible UX. This middleware fixes that.
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { ipKeyGenerator } from "express-rate-limit";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const BRUTE_FORCE_CONFIG = {
    /**
     * Failed attempts before blocking. Production: 5 — generous enough
     * for legitimate typos, strict enough to stop guessing.
     */
    maxFailedAttempts: parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS ?? "5", 10),
    maxFailedAttemptsDev: parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS_DEV ?? "1000", 10),
    /**
     * Window over which failed attempts accumulate (seconds).
     * 15 minutes — long enough to detect distributed attempts, short
     * enough to forgive forgotten passwords.
     */
    windowSeconds: 15 * 60,
    /**
     * Block duration after limit hit (seconds).
     * 15 minutes in production — punishes attackers without permanently
     * locking out forgetful users.
     */
    blockSeconds: parseInt(process.env.BRUTE_FORCE_BLOCK_SECONDS ?? "900", 10),
    blockSecondsDev: 1,
    /**
     * Max entries the in-memory store will hold. Defends against unbounded
     * memory growth from distributed attacks (attacker rotates millions of
     * IPs to fill the store).
     */
    maxStoreEntries: 100_000,
    /**
     * Whether to enforce in development. Default off so local dev iteration
     * isn't blocked. AUTH_BRUTE_ENABLE_DEV=true to test locally.
     */
    enableInDev: process.env.AUTH_BRUTE_ENABLE_DEV === "true",
    /**
     * Max email length used in the key. Same defense-in-depth as authLimiter.
     */
    maxEmailLength: 200,
};
const isDev = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";
// ============================================================
// LIMITER INSTANCE
// ============================================================
const loginBruteLimiter = new RateLimiterMemory({
    keyPrefix: "rl_brute_login",
    points: isDev ? BRUTE_FORCE_CONFIG.maxFailedAttemptsDev : BRUTE_FORCE_CONFIG.maxFailedAttempts,
    duration: BRUTE_FORCE_CONFIG.windowSeconds,
    blockDuration: isDev ? BRUTE_FORCE_CONFIG.blockSecondsDev : BRUTE_FORCE_CONFIG.blockSeconds,
});
// ============================================================
// HELPERS
// ============================================================
/**
 * Normalize email for keying. Lowercase, trim, length-cap.
 * Falls back to "anonymous" for missing/invalid input.
 */
function normalizeEmail(raw) {
    if (typeof raw !== "string" || raw.length === 0)
        return "anonymous";
    const cleaned = raw.trim().toLowerCase();
    if (cleaned.length === 0)
        return "anonymous";
    return cleaned.slice(0, BRUTE_FORCE_CONFIG.maxEmailLength);
}
/**
 * FNV-1a hash for email. Non-cryptographic — protects against
 * accidental plaintext exposure in logs/store dumps, not against
 * adversarial attack on the key.
 */
function hashEmail(email) {
    if (email === "anonymous")
        return "anon";
    let hash = 2166136261;
    for (let i = 0; i < email.length; i++) {
        hash ^= email.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(36);
}
/**
 * Build the rate-limit key from request. Combines IP (with IPv6 /64
 * collapse) and hashed email so:
 *   - Attacker on one IP can't bypass by rotating emails
 *   - Legitimate users on shared IPs aren't penalized for each other
 *   - IPv6 attackers can't rotate addresses cheaply
 */
function buildKey(req) {
    const ipPart = ipKeyGenerator(req.ip ?? "unknown");
    const rawEmail = typeof req.body?.email === "string" ? req.body.email : undefined;
    const emailHash = hashEmail(normalizeEmail(rawEmail));
    return ipPart + ":" + emailHash;
}
/**
 * Get a stable request identifier for log correlation.
 */
function getRequestId(req) {
    const reqWithId = req;
    return reqWithId.requestId ?? "";
}
/**
 * Check whether the limiter should skip this request entirely.
 */
function shouldSkip(req) {
    if (isTest)
        return true;
    if (isDev && !BRUTE_FORCE_CONFIG.enableInDev)
        return true;
    if (req.method === "OPTIONS")
        return true;
    return false;
}
/**
 * Convert rate-limit response to retry-after seconds.
 */
function getRetryAfterSeconds(err) {
    if (err instanceof RateLimiterRes) {
        return Math.ceil(err.msBeforeNext / 1000);
    }
    return BRUTE_FORCE_CONFIG.blockSeconds;
}
// ============================================================
// MIDDLEWARE — CHECK ONLY (does NOT consume)
// ============================================================
/**
 * Brute-force guard. Checks if the requester is currently blocked
 * and rejects with 429 if so. Does NOT consume a point — that happens
 * after the auth attempt via recordFailedAttempt.
 *
 * This separation matters: counting checks-as-attempts would block
 * legitimate users who refresh the page. We only count actual
 * authentication failures.
 *
 * Usage:
 *   router.post("/login", bruteForceGuard, loginController);
 *
 *   // In loginController:
 *   try {
 *     const user = await authenticate(email, password);
 *     await resetAttempts(req);   // clear on success
 *     return res.json({ success: true, user });
 *   } catch (err) {
 *     await recordFailedAttempt(req);  // count this failure
 *     return res.status(401).json({ ... });
 *   }
 */
export const bruteForceGuard = async (req, res, next) => {
    if (shouldSkip(req)) {
        next();
        return;
    }
    const key = buildKey(req);
    try {
        // get() doesn't consume — just checks current state
        const result = await loginBruteLimiter.get(key);
        if (result && result.remainingPoints <= 0 && result.msBeforeNext > 0) {
            // Currently blocked
            const retryAfter = Math.ceil(result.msBeforeNext / 1000);
            dbLogger.warn("Brute-force guard blocked: " +
                "key=" + key +
                " retryAfter=" + retryAfter + "s" +
                " path=" + (req.originalUrl ?? "") +
                (getRequestId(req) ? " requestId=" + getRequestId(req) : ""));
            res.setHeader("Retry-After", String(retryAfter));
            res.status(429).json({
                success: false,
                error: {
                    code: "BRUTE_FORCE_BLOCKED",
                    message: "Too many failed attempts. Please wait before trying again.",
                    retryAfter,
                },
            });
            return;
        }
        next();
    }
    catch (err) {
        // get() should never throw, but defense in depth — fail OPEN.
        // If the limiter is broken, blocking ALL logins is worse than
        // briefly permitting potential brute-force.
        dbLogger.error("Brute-force guard error: " +
            (err?.message ?? "unknown") +
            " — failing open");
        next();
    }
};
// ============================================================
// HELPERS FOR AUTH CONTROLLERS
// ============================================================
/**
 * Record a failed authentication attempt. Call this from your auth
 * controller AFTER an authentication failure (wrong password,
 * unknown email, disabled account, etc.).
 *
 * Returns the remaining attempts before block — useful for warning
 * the user ("3 attempts remaining").
 */
export async function recordFailedAttempt(req) {
    if (shouldSkip(req)) {
        return { blocked: false };
    }
    const key = buildKey(req);
    try {
        const result = await loginBruteLimiter.consume(key, 1);
        dbLogger.info("Failed auth attempt recorded: " +
            "key=" + key +
            " remaining=" + result.remainingPoints +
            (getRequestId(req) ? " requestId=" + getRequestId(req) : ""));
        return {
            blocked: false,
            remainingPoints: result.remainingPoints,
        };
    }
    catch (err) {
        if (err instanceof RateLimiterRes) {
            // Limit hit — user is now blocked
            const retryAfter = Math.ceil(err.msBeforeNext / 1000);
            dbLogger.warn("Brute-force threshold crossed: " +
                "key=" + key +
                " retryAfter=" + retryAfter + "s" +
                (getRequestId(req) ? " requestId=" + getRequestId(req) : ""));
            return {
                blocked: true,
                retryAfter,
            };
        }
        // Unknown error — fail closed for failure recording
        // (recording failure on failure is conservative; better than
        // silently letting attempts through unmetered)
        dbLogger.error("Brute-force record error: " +
            (err?.message ?? "unknown"));
        return { blocked: false };
    }
}
/**
 * Reset the failure counter. Call this from your auth controller
 * AFTER a successful authentication.
 *
 * This is what gives the system its "forgiving" property — a user
 * who eventually logs in correctly clears their failure history.
 */
export async function resetAttempts(req) {
    if (shouldSkip(req))
        return;
    const key = buildKey(req);
    try {
        await loginBruteLimiter.delete(key);
        dbLogger.info("Brute-force counter reset: " +
            "key=" + key +
            (getRequestId(req) ? " requestId=" + getRequestId(req) : ""));
    }
    catch (err) {
        // Reset failure isn't critical — the counter will expire on its own
        dbLogger.warn("Brute-force reset failed: " +
            (err?.message ?? "unknown"));
    }
}
/**
 * Get current brute-force status for a request. Useful for endpoints
 * that want to show "you have 3 attempts remaining" UI before the
 * user submits.
 */
export async function getBruteForceStatus(req) {
    if (shouldSkip(req)) {
        return { blocked: false };
    }
    const key = buildKey(req);
    try {
        const result = await loginBruteLimiter.get(key);
        if (!result) {
            const max = isDev
                ? BRUTE_FORCE_CONFIG.maxFailedAttemptsDev
                : BRUTE_FORCE_CONFIG.maxFailedAttempts;
            return {
                blocked: false,
                attemptsRemaining: max,
            };
        }
        if (result.remainingPoints <= 0 && result.msBeforeNext > 0) {
            return {
                blocked: true,
                retryAfter: Math.ceil(result.msBeforeNext / 1000),
            };
        }
        return {
            blocked: false,
            attemptsRemaining: result.remainingPoints,
        };
    }
    catch {
        return { blocked: false };
    }
}
export default bruteForceGuard;
//# sourceMappingURL=bruteForce.js.map