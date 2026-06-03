// constants.ts
//
// Application-wide HTTP and system constants. Lives at the top of the
// src/ tree because it's used by every layer (middleware, controllers,
// services). No business logic here — those belong in domain files
// (plans.ts, permissions.ts, alert.model.ts, etc.).
//
// Use these everywhere instead of magic numbers / strings:
//   - HTTP_STATUS.OK instead of 200
//   - ERROR_CODES.UNAUTHORIZED instead of "UNAUTHORIZED"
//   - PAGINATION.DEFAULT_LIMIT instead of 20
//
// Adding a new constant: pick the right group, follow VERB_RESOURCE
// naming, add JSDoc if not self-explanatory.
// ============================================================
// HTTP STATUS CODES
// ============================================================
/**
 * HTTP status codes used across the application. Includes only the
 * codes we actually use — RFC 7231 has more, but enumerating them all
 * is noise.
 *
 * Use HTTP_STATUS.OK instead of literal 200 throughout the codebase.
 */
export const HTTP_STATUS = {
    // 2xx success
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
    // 3xx redirect
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    NOT_MODIFIED: 304,
    // 4xx client error
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    GONE: 410,
    PAYLOAD_TOO_LARGE: 413,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    // 5xx server error
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
};
// ============================================================
// HTTP METHODS
// ============================================================
export const HTTP_METHODS = {
    GET: "GET",
    POST: "POST",
    PUT: "PUT",
    PATCH: "PATCH",
    DELETE: "DELETE",
    OPTIONS: "OPTIONS",
    HEAD: "HEAD",
};
// ============================================================
// COMMON HEADERS
// ============================================================
/**
 * Standard and custom header names we read or set. Centralizing avoids
 * case-sensitivity bugs (HTTP headers are case-insensitive, but TS
 * comparisons aren't).
 */
export const HEADERS = {
    // Standard
    AUTHORIZATION: "authorization",
    CONTENT_TYPE: "content-type",
    ACCEPT: "accept",
    ACCEPT_LANGUAGE: "accept-language",
    USER_AGENT: "user-agent",
    CACHE_CONTROL: "cache-control",
    ETAG: "etag",
    IF_NONE_MATCH: "if-none-match",
    RETRY_AFTER: "retry-after",
    WWW_AUTHENTICATE: "www-authenticate",
    // Forwarded / proxy
    X_FORWARDED_FOR: "x-forwarded-for",
    X_REAL_IP: "x-real-ip",
    // Stripe
    STRIPE_SIGNATURE: "stripe-signature",
    // Custom — app-specific
    X_REQUEST_ID: "x-request-id",
    X_TENANT_OVERRIDE: "x-tenant-override",
    X_BILLING_STATUS: "x-billing-status",
    X_CACHE: "x-cache",
};
// ============================================================
// CONTENT TYPES
// ============================================================
export const CONTENT_TYPES = {
    JSON: "application/json",
    FORM_URLENCODED: "application/x-www-form-urlencoded",
    MULTIPART: "multipart/form-data",
    TEXT_PLAIN: "text/plain",
    TEXT_HTML: "text/html",
    TEXT_CSV: "text/csv",
    PDF: "application/pdf",
    OCTET_STREAM: "application/octet-stream",
};
// ============================================================
// ERROR CODES
// ============================================================
/**
 * Application error codes. Returned in error.code field of error
 * responses. Frontend pattern-matches on these to render specific UX.
 *
 * Naming: SCREAMING_SNAKE_CASE, verb-resource pattern where applicable.
 * Resource-specific codes (DEAL_NOT_FOUND) belong in domain modules,
 * not here. This file holds cross-cutting codes only.
 */
export const ERROR_CODES = {
    // Auth & identity
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    INVALID_TOKEN: "INVALID_TOKEN",
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    SESSION_EXPIRED: "SESSION_EXPIRED",
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
    ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
    // Tenancy
    NO_ORG: "NO_ORG",
    INVALID_ORG_FORMAT: "INVALID_ORG_FORMAT",
    ORG_NOT_FOUND: "ORG_NOT_FOUND",
    CROSS_TENANT_DENIED: "CROSS_TENANT_DENIED",
    // Validation
    VALIDATION_ERROR: "VALIDATION_ERROR",
    MISSING_ID: "MISSING_ID",
    INVALID_ID: "INVALID_ID",
    INVALID_INPUT: "INVALID_INPUT",
    // Resource lifecycle
    NOT_FOUND: "NOT_FOUND",
    ALREADY_EXISTS: "ALREADY_EXISTS",
    CONFLICT: "CONFLICT",
    GONE: "GONE",
    // Quotas & limits
    QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
    RATE_LIMITED: "RATE_LIMITED",
    PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
    // Plan & billing
    FEATURE_GATED: "FEATURE_GATED",
    TRIAL_EXPIRED: "TRIAL_EXPIRED",
    GRACE_EXPIRED: "GRACE_EXPIRED",
    PAYMENT_FAILED: "PAYMENT_FAILED",
    CARD_ERROR: "CARD_ERROR",
    // Brute-force / abuse
    BRUTE_FORCE_BLOCKED: "BRUTE_FORCE_BLOCKED",
    // Infrastructure
    INTERNAL_ERROR: "INTERNAL_ERROR",
    NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
    TIMEOUT: "TIMEOUT",
    UPSTREAM_ERROR: "UPSTREAM_ERROR",
};
// ============================================================
// PAGINATION DEFAULTS
// ============================================================
/**
 * Pagination bounds used by every list endpoint. Centralized so the
 * defaults are consistent. Override per-endpoint only with good reason.
 */
export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    MAX_PAGE: 10_000,
};
// ============================================================
// SORT ORDERS
// ============================================================
export const SORT_ORDERS = {
    ASC: "asc",
    DESC: "desc",
};
// ============================================================
// TIME CONSTANTS
// ============================================================
/**
 * Time durations in milliseconds. Use these instead of literal
 * arithmetic — ONE_DAY_MS is clearer than 1000 * 60 * 60 * 24.
 */
export const TIME = {
    ONE_SECOND_MS: 1_000,
    ONE_MINUTE_MS: 60 * 1_000,
    ONE_HOUR_MS: 60 * 60 * 1_000,
    ONE_DAY_MS: 24 * 60 * 60 * 1_000,
    ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1_000,
    ONE_MONTH_MS: 30 * 24 * 60 * 60 * 1_000,
    ONE_YEAR_MS: 365 * 24 * 60 * 60 * 1_000,
    ONE_SECOND_S: 1,
    ONE_MINUTE_S: 60,
    ONE_HOUR_S: 60 * 60,
    ONE_DAY_S: 24 * 60 * 60,
    ONE_WEEK_S: 7 * 24 * 60 * 60,
};
// ============================================================
// SIZE LIMITS
// ============================================================
/**
 * Default upload, payload, and body-size limits.
 * Per-route overrides go in route config.
 */
export const SIZE_LIMITS = {
    REQUEST_BODY_MAX: "1mb",
    WEBHOOK_BODY_MAX: "1mb",
    FILE_UPLOAD_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
    CSV_EXPORT_MAX_ROWS: 10_000,
    BULK_OPERATION_MAX: 100,
    AVATAR_MAX_BYTES: 2 * 1024 * 1024, // 2 MB
};
// ============================================================
// COOKIE NAMES
// ============================================================
export const COOKIE_NAMES = {
    ACCESS_TOKEN: "situs_access",
    REFRESH_TOKEN: "situs_refresh",
    CSRF_TOKEN: "situs_csrf",
    SESSION: "situs_sid",
};
// ============================================================
// CACHE KEY PREFIXES
// ============================================================
/**
 * Prefixes for Redis cache keys. Centralizing prevents collisions
 * when multiple modules cache to the same Redis instance.
 *
 * Convention: <prefix>:<scope>:<identifier>
 *   - cache:org:<orgId>
 *   - rl:auth:<ipHash>:<emailHash>
 *   - sess:user:<userId>
 */
export const CACHE_KEY_PREFIXES = {
    CACHE: "cache",
    RATE_LIMIT: "rl",
    SESSION: "sess",
    BRUTE_FORCE: "rl_brute_login",
    LIMIT_GUARD: "limit",
    BILLING_GUARD: "billing",
};
// ============================================================
// REGEX PATTERNS
// ============================================================
/**
 * Reusable regex patterns. Compile once at module load time.
 * Use with caution — input validation should generally use Zod schemas,
 * not regex.
 */
export const REGEX = {
    /** Loose email check — Zod's email() is stricter and preferred */
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    /** MongoDB ObjectId 24-hex string */
    OBJECT_ID: /^[0-9a-fA-F]{24}$/,
    /** Slug: lowercase alphanumeric with hyphens */
    SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    /** UUID v4 */
    UUID_V4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    /** ISO 8601 date — loose, validates format only */
    ISO_DATE: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
};
// ============================================================
// SENSITIVE FIELD REDACTION
// ============================================================
/**
 * Field names that should be redacted in logs, audit metadata, and
 * error responses. Case-insensitive matching.
 */
export const SENSITIVE_FIELDS = [
    "password",
    "passwordHash",
    "currentPassword",
    "newPassword",
    "confirmPassword",
    "token",
    "accessToken",
    "refreshToken",
    "jwt",
    "secret",
    "apiKey",
    "api_key",
    "authorization",
    "cookie",
    "creditCard",
    "cardNumber",
    "cvv",
    "ssn",
    "otp",
    "verificationCode",
    "stripeSecretKey",
    "webhookSecret",
];
// ============================================================
// ENVIRONMENT NAMES
// ============================================================
export const ENVIRONMENTS = {
    DEVELOPMENT: "development",
    TEST: "test",
    STAGING: "staging",
    PRODUCTION: "production",
};
// ============================================================
// REQUEST ID GENERATION HINTS
// ============================================================
export const REQUEST_ID = {
    HEADER_NAME: "x-request-id",
    MAX_LENGTH: 64,
};
// ============================================================
// API VERSION
// ============================================================
/**
 * Public API version exposed in response headers and OpenAPI specs.
 * Bump on breaking changes; document migration path when bumping.
 */
export const API_VERSION = "v1";
// ============================================================
// LOCALE & CURRENCY DEFAULTS
// ============================================================
/**
 * Default locale and currency. Situs targets Indian market first, so
 * INR + en-IN are the defaults. Override per-user via user preferences.
 */
export const LOCALE_DEFAULTS = {
    LOCALE: "en-IN",
    CURRENCY: "INR",
    TIMEZONE: "Asia/Kolkata",
    DATE_FORMAT: "DD/MM/YYYY",
};
// ============================================================
// FORMATTING THRESHOLDS
// ============================================================
/**
 * Indian currency thresholds. Below LAKH → display in plain rupees.
 * Above LAKH but below CRORE → display in Lakh. Above CRORE → display in Cr.
 */
export const INR_THRESHOLDS = {
    LAKH: 100_000,
    CRORE: 10_000_000,
};
//# sourceMappingURL=constants.js.map