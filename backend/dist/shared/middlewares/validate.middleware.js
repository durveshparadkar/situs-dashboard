import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const VALIDATE_CONFIG = {
    /**
     * Max number of validation issues returned in the error response.
     * Defends against requests that intentionally trigger thousands of
     * issues to bloat response payloads.
     */
    maxIssuesInResponse: 50,
    /**
     * Whether to expose Zod's full issue details in non-production.
     * Production responses include only field + message — never the
     * received value (could leak sensitive data back to attacker).
     */
    exposeFullDetailsInDev: process.env.NODE_ENV !== "production",
    /**
     * Whether to log validation failures. WARN-level helps catch
     * malformed-request patterns and reveals API misuse.
     */
    logFailures: true,
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Standardized error response.
 */
function sendValidationError(res, issues, customMessage) {
    res.status(400).json({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: customMessage || "Validation failed",
            details: issues,
        },
    });
}
/**
 * Format Zod issues into a structured, client-safe shape.
 * Production responses include only field + message + code;
 * dev responses also include the path array for debugging.
 */
function formatIssues(issues) {
    const limited = issues.slice(0, VALIDATE_CONFIG.maxIssuesInResponse);
    return limited.map((issue) => {
        const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        const base = {
            field,
            message: issue.message,
            code: issue.code,
        };
        if (VALIDATE_CONFIG.exposeFullDetailsInDev) {
            base.path = issue.path.filter((p) => typeof p === "string" || typeof p === "number");
        }
        return base;
    });
}
/**
 * Pull the request property for the configured target.
 */
function getTargetData(req, target) {
    switch (target) {
        case "body": return req.body;
        case "query": return req.query;
        case "params": return req.params;
        case "headers": return req.headers;
    }
}
/**
 * Set the request property with parsed data. Express's req.query
 * and req.params are read-only in modern Express versions, so we
 * use Object.assign to preserve their internal getters.
 */
function setTargetData(req, target, data) {
    if (data === null || typeof data !== "object") {
        // Primitives or null — only safe to replace body
        if (target === "body") {
            req.body = data;
        }
        return;
    }
    const obj = data;
    switch (target) {
        case "body":
            req.body = obj;
            break;
        case "query":
            // Clear existing keys, then assign parsed values
            for (const key of Object.keys(req.query)) {
                delete req.query[key];
            }
            Object.assign(req.query, obj);
            break;
        case "params":
            for (const key of Object.keys(req.params)) {
                delete req.params[key];
            }
            Object.assign(req.params, obj);
            break;
        case "headers":
            // Headers are case-insensitive and frequently read elsewhere;
            // replacing them is risky. Skip silently.
            break;
    }
}
/**
 * Get a request identifier for log correlation.
 */
function getRequestContext(req) {
    const u = req.user;
    const userId = (u && typeof u.id === "string" && u.id) ||
        (u && u._id ? String(u._id) : undefined);
    return {
        method: req.method,
        path: req.originalUrl || req.url || "",
        ...(userId && { userId }),
        ...(req.requestId && {
            requestId: req.requestId,
        }),
    };
}
// ============================================================
// SINGLE-TARGET VALIDATE
// ============================================================
/**
 * Validate one part of the request against a Zod schema.
 *
 * Usage:
 *   router.post("/teams",  validate(createTeamSchema), createTeam);
 *   router.get("/deals",   validate(listDealsSchema, { target: "query" }), listDeals);
 *   router.get("/:id",     validate(idSchema, { target: "params" }), getOne);
 *
 * On success, the parsed data replaces req[target] (configurable).
 * On failure, returns 400 with structured error details.
 */
export function validate(schema, options = {}) {
    const target = options.target ?? "body";
    // Default: replace body, leave query/params/headers as Express sees them
    const replaceWithParsed = options.replaceWithParsed ?? (target === "body");
    return (req, res, next) => {
        const data = getTargetData(req, target);
        const result = schema.safeParse(data);
        if (!result.success) {
            const issues = formatIssues(result.error.issues);
            if (VALIDATE_CONFIG.logFailures) {
                const ctx = getRequestContext(req);
                dbLogger.warn("Validation failed: target=" + target +
                    " method=" + ctx.method +
                    " path=" + ctx.path +
                    (ctx.userId ? " user=" + ctx.userId : "") +
                    (ctx.requestId ? " requestId=" + ctx.requestId : "") +
                    " issues=" + issues.length +
                    " first=" + (issues[0] ? issues[0].field + ":" + issues[0].message : "n/a"));
            }
            sendValidationError(res, issues, options.errorMessage);
            return;
        }
        if (replaceWithParsed) {
            try {
                setTargetData(req, target, result.data);
            }
            catch (err) {
                // Setting req.query/params can fail in some Express versions —
                // failures here aren't validation errors, just data-passing issues.
                // Log and continue with the original (already-validated) data.
                dbLogger.warn("Could not replace req." + target + " with parsed data: " +
                    (err?.message ?? "unknown"));
            }
        }
        next();
    };
}
// ============================================================
// MULTI-TARGET VALIDATE
// Pass separate schemas for body, query, params, headers in one call.
// ============================================================
/**
 * Validate multiple request properties in a single middleware.
 *
 * Useful for endpoints where multiple parts of the request need
 * validation — instead of stacking three validate() calls.
 *
 * Usage:
 *   router.patch(
 *     "/teams/:id",
 *     validateRequest({
 *       params: z.object({ id: objectIdSchema }),
 *       query:  z.object({ notify: z.string().optional() }),
 *       body:   updateTeamSchema,
 *     }),
 *     updateTeam
 *   );
 *
 * All schemas run in parallel; ALL failures are collected and returned
 * in a single response — frontend learns about every issue at once.
 */
export function validateRequest(schemas, options = {}) {
    const entries = Object.entries(schemas).filter(([, schema]) => schema !== undefined);
    if (entries.length === 0) {
        throw new Error("validateRequest() requires at least one schema");
    }
    return (req, res, next) => {
        const allIssues = [];
        const parsedByTarget = {};
        for (const [target, schema] of entries) {
            const data = getTargetData(req, target);
            const result = schema.safeParse(data);
            if (!result.success) {
                // Prefix field paths with their target so frontend knows whether
                // "name" was in body or query
                const prefixed = formatIssues(result.error.issues).map((issue) => ({
                    ...issue,
                    field: target + "." + issue.field,
                }));
                allIssues.push(...prefixed);
            }
            else {
                parsedByTarget[target] = result.data;
            }
        }
        if (allIssues.length > 0) {
            if (VALIDATE_CONFIG.logFailures) {
                const ctx = getRequestContext(req);
                dbLogger.warn("Multi-validation failed: method=" + ctx.method +
                    " path=" + ctx.path +
                    (ctx.userId ? " user=" + ctx.userId : "") +
                    (ctx.requestId ? " requestId=" + ctx.requestId : "") +
                    " issues=" + allIssues.length);
            }
            sendValidationError(res, allIssues.slice(0, VALIDATE_CONFIG.maxIssuesInResponse), options.errorMessage);
            return;
        }
        // All schemas passed — apply parsed data where appropriate
        for (const [target, data] of Object.entries(parsedByTarget)) {
            try {
                // Default replacement policy: body yes, others no
                if (target === "body") {
                    setTargetData(req, target, data);
                }
            }
            catch (err) {
                dbLogger.warn("Could not replace req." + target + " with parsed data: " +
                    (err?.message ?? "unknown"));
            }
        }
        next();
    };
}
// ============================================================
// CONVENIENCE WRAPPERS
// ============================================================
/**
 * Shorthand: validate req.query against a schema.
 */
export function validateQuery(schema, options = {}) {
    return validate(schema, { ...options, target: "query" });
}
/**
 * Shorthand: validate req.params against a schema.
 */
export function validateParams(schema, options = {}) {
    return validate(schema, { ...options, target: "params" });
}
/**
 * Shorthand: validate req.body against a schema (default behavior of validate).
 * Exported for symmetry with the other helpers.
 */
export function validateBody(schema, options = {}) {
    return validate(schema, { ...options, target: "body" });
}
export default validate;
//# sourceMappingURL=validate.middleware.js.map