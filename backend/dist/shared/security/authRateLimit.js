// authLimiter.ts
//
// Rate limiter dedicated to authentication endpoints — login, signup,
// password reset, refresh-token issuance. These endpoints are the primary
// target for credential stuffing, brute-force password attacks, and
// account enumeration. Tighter limits than general API endpoints.
//
// Used by:
//   - auth.routes.ts — applied to /login, /register, /forgot-password,
//                       /reset-password, /refresh-token
//
// Different from apiLimiter in rateLimit.middleware.ts which covers
// general read/write endpoints. Auth endpoints get their own limiter
// with stricter thresholds.
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const AUTH_LIMITER_CONFIG = {
    /** Window size in milliseconds — 15 minutes */
    windowMs: 15 * 60 * 1000,
    /**
     * Max attempts per key per window.
     * Production: 10 — generous enough for typo-prone users on shared IPs,
     *              strict enough to stop credential stuffing
     * Development: 100 — avoid friction during local testing
     *
     * Override via AUTH_LIMITER_MAX env var if needed.
     */
    maxProd: parseInt(process.env.AUTH_LIMITER_MAX ?? "10", 10),
    maxDev: parseInt(process.env.AUTH_LIMITER_MAX_DEV ?? "100", 10),
    /**
     * Whether to enforce the limiter in development. Default off so local
     * dev iteration isn't blocked. Turn on (AUTH_LIMITER_ENABLE_DEV=true)
     * when testing rate-limit behavior locally.
     */
    enableInDev: process.env.AUTH_LIMITER_ENABLE_DEV === "true",
    /**
     * Max email length used in the key. Defends against pathologically long
     * email values bloating Redis memory or the in-memory store.
     */
    maxEmailLength: 200,
    /**
     * Paths skipped entirely from rate limiting. Health checks and CORS
     * preflight requests must always pass through.
     */
    skipPaths: ["/health", "/healthz", "/ready"],
    /**
     * Skip limiter entirely in test mode so test suites don't get blocked.
     */
    skipInTest: process.env.NODE_ENV === "test",
};
const isDev = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";
// ============================================================
// HELPERS
// ============================================================
/**
 * Normalize an email for keying.
 * - Trim whitespace
 * - Lowercase
 * - Length-cap to defend against huge inputs
 * - Empty / non-string → "anonymous" sentinel
 */
function normalizeEmail(raw) {
    if (typeof raw !== "string" || raw.length === 0)
        return "anonymous";
    const cleaned = raw.trim().toLowerCase();
    if (cleaned.length === 0)
        return "anonymous";
    return cleaned.slice(0, AUTH_LIMITER_CONFIG.maxEmailLength);
}
/**
 * Hash the email portion of the key so plaintext credentials never
 * appear in Redis logs, store dumps, or error reports.
 *
 * FNV-1a is fast and non-cryptographic — appropriate for keying, not
 * for security. We're protecting against accidental leakage, not
 * adversarial attack on the key itself.
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
 * Get a stable request identifier for logging correlation.
 */
function getRequestId(req) {
    const reqWithId = req;
    return reqWithId.requestId ?? "";
}
// ============================================================
// LIMITER
// ============================================================
/**
 * Authentication rate limiter — tight limits to prevent credential
 * stuffing and brute-force attacks while remaining usable for
 * legitimate users with typo-prone fingers.
 *
 * Key strategy: IP + hashed(email)
 *   - IP alone: shared offices, schools, mobile carriers behind NAT
 *     would lock out all users when one user mistypes
 *   - Email alone: attacker rotates emails, bypasses limit
 *   - IP + email: attacker on one IP can only hammer a single account;
 *     legitimate users on shared IPs aren't affected by each other
 *
 * Email is hashed so plaintext never appears in Redis keys, store
 * dumps, or rate-limit error logs.
 */
export const authLimiter = rateLimit({
    windowMs: AUTH_LIMITER_CONFIG.windowMs,
    max: isDev ? AUTH_LIMITER_CONFIG.maxDev : AUTH_LIMITER_CONFIG.maxProd,
    // RFC 6585 draft-7 headers
    standardHeaders: "draft-7",
    legacyHeaders: false,
    /**
     * Key generator combines IP (IPv6-safe via ipKeyGenerator) and a hash
     * of the email. ipKeyGenerator collapses IPv6 /64 blocks to prevent
     * trivial bypass via IPv6 rotation.
     */
    keyGenerator: (req) => {
        // ipKeyGenerator is the recommended way to handle both IPv4 and IPv6
        // safely under express-rate-limit. It collapses IPv6 /64 to a single
        // logical address, so attackers can't rotate through 2^64 IPs.
        const ipPart = ipKeyGenerator(req.ip ?? "unknown");
        // Email comes from body on login / register / password reset routes
        const rawEmail = typeof req.body?.email === "string" ? req.body.email : undefined;
        const emailHash = hashEmail(normalizeEmail(rawEmail));
        return ipPart + ":" + emailHash;
    },
    /**
     * Skip limiter for:
     *   - CORS preflight (OPTIONS)
     *   - Health checks
     *   - Test environment (so test suites don't get blocked)
     *   - Development (unless explicitly enabled)
     */
    skip: (req) => {
        if (req.method === "OPTIONS")
            return true;
        const path = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
        if (AUTH_LIMITER_CONFIG.skipPaths.includes(path)) {
            return true;
        }
        if (AUTH_LIMITER_CONFIG.skipInTest)
            return true;
        if (isDev && !AUTH_LIMITER_CONFIG.enableInDev)
            return true;
        return false;
    },
    /**
     * Structured 429 response with retry-after info. Frontend can show
     * a countdown and disable the submit button.
     *
     * Importantly: same response shape regardless of whether the email
     * exists or not. Prevents account enumeration via timing/response
     * differences ("user A got rate-limited after 5 tries, user B didn't,
     * so user B must not exist").
     */
    handler: (req, res) => {
        const retryAfterHeader = res.getHeader("Retry-After");
        const retryAfter = typeof retryAfterHeader === "string"
            ? parseInt(retryAfterHeader, 10)
            : typeof retryAfterHeader === "number"
                ? retryAfterHeader
                : Math.ceil(AUTH_LIMITER_CONFIG.windowMs / 1000);
        // Structured log entry — searchable, no plaintext credentials
        const ipPart = ipKeyGenerator(req.ip ?? "unknown");
        const emailHash = hashEmail(normalizeEmail(typeof req.body?.email === "string" ? req.body.email : undefined));
        dbLogger.warn("Auth rate limit hit: " +
            "ip=" + ipPart +
            " emailHash=" + emailHash +
            " method=" + req.method +
            " path=" + (req.originalUrl ?? req.url ?? "") +
            (getRequestId(req) ? " requestId=" + getRequestId(req) : ""));
        res.status(429).json({
            success: false,
            error: {
                code: "RATE_LIMITED",
                message: "Too many authentication attempts. Please wait before trying again.",
                retryAfter,
            },
        });
    },
});
export default authLimiter;
//# sourceMappingURL=authRateLimit.js.map