// queue.ui.ts
//
// Bull Board admin UI for BullMQ queue inspection. Provides a web
// dashboard at /admin/queues for monitoring jobs, retrying failures,
// and debugging queue issues.
//
// CRITICAL SECURITY:
//   The default Bull Board mount has ZERO authentication. Without the
//   guards in this file, anyone hitting /admin/queues can:
//     - See every job payload (emails, names, billing details)
//     - Retry, delete, or modify any job
//     - Pause / resume / drain queues
//   This file adds: env-gated enablement, JWT + role check, basic-auth
//   fallback for ops, and audit logging of every admin access.
//
// Usage:
//   import { mountQueueUI, getQueueUIBasePath } from "./config/queue.ui.js";
//
//   if (mountQueueUI) {
//     app.use(getQueueUIBasePath(), mountQueueUI(app));
//   }
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { emailQueue } from "./queue.js";
import { dbLogger } from "../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const QUEUE_UI_CONFIG = {
    /**
     * Mount path for the admin UI. Don't change this in code — change
     * via QUEUE_UI_BASE_PATH env var. Routing collisions with other admin
     * routes (e.g. /admin/users) should be avoided by keeping this nested.
     */
    basePath: process.env.QUEUE_UI_BASE_PATH ?? "/admin/queues",
    /**
     * Whether to mount the UI at all. Defaults to:
     *   - dev/staging: enabled
     *   - production:  disabled UNLESS QUEUE_UI_ENABLED=true
     *
     * In production, you typically want this disabled OR locked down to
     * a specific IP range. Exposing it on the public internet — even with
     * auth — is risk surface most apps don't need.
     */
    enabled: (() => {
        const explicit = process.env.QUEUE_UI_ENABLED;
        if (explicit === "true")
            return true;
        if (explicit === "false")
            return false;
        return process.env.NODE_ENV !== "production";
    })(),
    /**
     * Auth mode:
     *   - "jwt"        : require valid JWT + SUPER_ADMIN role (default)
     *   - "basic"      : HTTP Basic Auth with QUEUE_UI_USERNAME/PASSWORD env vars
     *   - "both"       : either JWT-with-role OR Basic Auth works
     *   - "none"       : NO AUTH — only safe behind VPN/IP allowlist
     *
     * "none" is provided for backwards compat but logs a critical warning
     * on every request. NEVER use "none" on a public-facing deployment.
     */
    authMode: (process.env.QUEUE_UI_AUTH_MODE ?? "jwt").toLowerCase(),
    /**
     * Roles allowed to access the UI. Defaults to SUPER_ADMIN only —
     * customer org admins should never see other orgs' queue data.
     */
    allowedRoles: (process.env.QUEUE_UI_ALLOWED_ROLES ?? "SUPER_ADMIN")
        .split(",")
        .map((r) => r.trim().toUpperCase())
        .filter((r) => r.length > 0),
    /**
     * Basic auth credentials. Set via env in production secrets manager.
     * Must both be set for "basic" or "both" auth mode to work.
     */
    basicUsername: process.env.QUEUE_UI_USERNAME,
    basicPassword: process.env.QUEUE_UI_PASSWORD,
};
// ============================================================
// HELPERS
// ============================================================
/**
* Send a 401 with WWW-Authenticate header for HTTP Basic Auth fallback.
*/
function sendUnauthorized(res, reason) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Queue Admin", charset="UTF-8"');
    res.status(401).json({
        success: false,
        error: {
            code: "UNAUTHORIZED",
            message: reason,
        },
    });
}
/**
* Send a 403 forbidden response.
*/
function sendForbidden(res, reason) {
    res.status(403).json({
        success: false,
        error: {
            code: "FORBIDDEN",
            message: reason,
        },
    });
}
/**
* Get a stable identifier for the user from req for log correlation.
*/
function getUserIdentity(req) {
    const u = req.user;
    if (!u)
        return "anonymous";
    if (typeof u.id === "string" && u.id.length > 0)
        return u.id;
    if (u._id)
        return String(u._id);
    return "unknown";
}
/**
* Get client IP for audit logging.
*/
function getClientIp(req) {
    return req.ip ?? "unknown";
}
/**
* Constant-time string comparison to prevent timing attacks on basic auth.
* Reduces information leakage about which character of the password is wrong.
*/
function safeEqual(a, b) {
    if (a.length !== b.length) {
        // Still iterate to make timing closer to equal-length case
        let acc = a.length ^ b.length;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return false;
    }
    let acc = 0;
    for (let i = 0; i < a.length; i++) {
        acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return acc === 0;
}
/**
* Parse HTTP Basic Auth header.
*/
function parseBasicAuth(header) {
    if (!header || !header.startsWith("Basic "))
        return null;
    try {
        const encoded = header.slice(6).trim();
        const decoded = Buffer.from(encoded, "base64").toString("utf-8");
        const sepIdx = decoded.indexOf(":");
        if (sepIdx < 0)
            return null;
        return {
            username: decoded.slice(0, sepIdx),
            password: decoded.slice(sepIdx + 1),
        };
    }
    catch {
        return null;
    }
}
// ============================================================
// AUTH MIDDLEWARE
// ============================================================
/**
* Build the auth middleware for queue UI based on configured authMode.
* Returns a single RequestHandler that performs the appropriate checks.
*/
function buildQueueUIAuth() {
    const mode = QUEUE_UI_CONFIG.authMode;
    // ---- Validate config at boot ----
    if (mode === "basic" || mode === "both") {
        if (!QUEUE_UI_CONFIG.basicUsername || !QUEUE_UI_CONFIG.basicPassword) {
            dbLogger.error("Queue UI auth mode includes 'basic' but QUEUE_UI_USERNAME / " +
                "QUEUE_UI_PASSWORD env vars are not set. UI will reject all requests.");
        }
        if (QUEUE_UI_CONFIG.basicPassword &&
            QUEUE_UI_CONFIG.basicPassword.length < 12) {
            dbLogger.warn("QUEUE_UI_PASSWORD is shorter than 12 characters. " +
                "Use a strong random password for production.");
        }
    }
    if (mode === "none") {
        dbLogger.warn("Queue UI auth mode is 'none' — UI is UNAUTHENTICATED. " +
            "This is unsafe on public deployments.");
    }
    // ---- Build the actual middleware ----
    return (req, res, next) => {
        const ip = getClientIp(req);
        const path = req.originalUrl ?? req.url ?? "";
        const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 200);
        // -------------------------------------------------------
        // MODE: none
        // -------------------------------------------------------
        if (mode === "none") {
            dbLogger.warn("Queue UI accessed without auth: ip=" + ip +
                " path=" + path +
                " ua=" + userAgent);
            next();
            return;
        }
        // -------------------------------------------------------
        // BASIC AUTH PATH
        // Try basic auth first if mode is "basic" or "both"
        // -------------------------------------------------------
        let basicAuthPassed = false;
        if (mode === "basic" || mode === "both") {
            const creds = parseBasicAuth(req.headers.authorization);
            if (creds) {
                const expectedUser = QUEUE_UI_CONFIG.basicUsername ?? "";
                const expectedPass = QUEUE_UI_CONFIG.basicPassword ?? "";
                if (expectedUser.length > 0 && expectedPass.length > 0) {
                    if (safeEqual(creds.username, expectedUser) &&
                        safeEqual(creds.password, expectedPass)) {
                        basicAuthPassed = true;
                    }
                    else {
                        dbLogger.warn("Queue UI basic auth failed: ip=" + ip +
                            " username=" + creds.username.slice(0, 50));
                    }
                }
            }
            // If mode is basic-only and basic failed, reject now
            if (mode === "basic" && !basicAuthPassed) {
                sendUnauthorized(res, "Authentication required");
                return;
            }
        }
        // -------------------------------------------------------
        // JWT PATH
        // Try JWT auth if mode is "jwt" or "both" (and basic didn't pass)
        // -------------------------------------------------------
        if (!basicAuthPassed && (mode === "jwt" || mode === "both")) {
            const user = req.user;
            if (!user) {
                sendUnauthorized(res, "Authentication required");
                return;
            }
            const role = String(user.role ?? "").trim().toUpperCase();
            if (!QUEUE_UI_CONFIG.allowedRoles.includes(role)) {
                dbLogger.warn("Queue UI access denied — insufficient role: " +
                    "user=" + getUserIdentity(req) +
                    " role=" + role +
                    " ip=" + ip);
                sendForbidden(res, "Queue admin requires one of: " + QUEUE_UI_CONFIG.allowedRoles.join(", "));
                return;
            }
        }
        // -------------------------------------------------------
        // AUDIT LOG — every successful access
        // -------------------------------------------------------
        dbLogger.info("Queue UI access: " +
            "user=" + getUserIdentity(req) +
            " ip=" + ip +
            " method=" + req.method +
            " path=" + path +
            " auth=" + (basicAuthPassed ? "basic" : "jwt"));
        next();
    };
}
// ============================================================
// BULL BOARD ADAPTER
// ============================================================
/**
* Create and configure the Bull Board adapter. Internal — used by
* mountQueueUI() below.
*/
function buildBullBoardAdapter() {
    const adapter = new ExpressAdapter();
    adapter.setBasePath(QUEUE_UI_CONFIG.basePath);
    createBullBoard({
        queues: [
            new BullMQAdapter(emailQueue, {
                readOnlyMode: process.env.QUEUE_UI_READ_ONLY === "true",
                description: "Outbound transactional email queue",
            }),
            // Add additional queues here as they're created:
            // new BullMQAdapter(syncQueue),
            // new BullMQAdapter(reportsQueue),
        ],
        serverAdapter: adapter,
        options: {
            uiConfig: {
                boardTitle: "Situs Queue Admin",
                boardLogo: {
                    path: "/static/logo.png",
                    width: "100px",
                    height: "auto",
                },
                favIcon: {
                    default: "/static/favicon.ico",
                    alternative: "/static/favicon.ico",
                },
            },
        },
    });
    return adapter;
}
// ============================================================
// PUBLIC API
// ============================================================
/**
* Mount the queue admin UI on the provided Express app. Returns the
* router that was mounted (or null if mounting was disabled by config).
*
* Caller should typically check:
*
*   const queueUIRouter = mountQueueUI(app);
*   if (!queueUIRouter) {
*     console.log("Queue UI disabled by config");
*   }
*/
export function mountQueueUI(app) {
    if (!QUEUE_UI_CONFIG.enabled) {
        dbLogger.info("Queue UI disabled (NODE_ENV=" + (process.env.NODE_ENV ?? "unknown") +
            ", QUEUE_UI_ENABLED=" + (process.env.QUEUE_UI_ENABLED ?? "unset") + ")");
        return null;
    }
    const auth = buildQueueUIAuth();
    const adapter = buildBullBoardAdapter();
    const router = adapter.getRouter();
    // Mount: auth middleware FIRST, then the Bull Board router
    app.use(QUEUE_UI_CONFIG.basePath, auth, router);
    dbLogger.info("Queue UI mounted: path=" + QUEUE_UI_CONFIG.basePath +
        " authMode=" + QUEUE_UI_CONFIG.authMode +
        " allowedRoles=" + QUEUE_UI_CONFIG.allowedRoles.join(",") +
        " readOnly=" + (process.env.QUEUE_UI_READ_ONLY === "true"));
    return router;
}
/**
* Get the configured base path. Useful for generating links in admin
* dashboards or documentation.
*/
export function getQueueUIBasePath() {
    return QUEUE_UI_CONFIG.basePath;
}
/**
* Check whether the UI is enabled. Useful for conditionally rendering
* "Queue Admin" links in admin nav UIs.
*/
export function isQueueUIEnabled() {
    return QUEUE_UI_CONFIG.enabled;
}
// ============================================================
// LEGACY EXPORT — backward compat
// ============================================================
/**
* @deprecated Use mountQueueUI(app) instead. This export remains for
* backward compatibility with the previous unauthenticated mount pattern.
*
* If you're using this, your queue UI has NO AUTH. Migrate to
* mountQueueUI(app) which adds JWT + role-based authentication.
*/
export const serverAdapter = buildBullBoardAdapter();
export default mountQueueUI;
//# sourceMappingURL=queue.ui.js.map