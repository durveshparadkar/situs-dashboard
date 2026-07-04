// core/types/express.d.ts
//
// Global Express type augmentation. Defines what middleware can attach
// to req and res, providing type safety for all downstream handlers.
//
// Design decisions:
//   - AuthenticatedUser is intentionally narrow (identity + tenancy +
//     authorization). Full user document is fetched on demand by handlers
//     that need it.
//   - Role is imported from the canonical permissions file —
//     single source of truth across the codebase.
//   - Optional fields throughout — handlers must check or use the
//     AuthenticatedRequest helper type that asserts auth ran.
//   - RequestContext separate from AuthenticatedUser so tracing
//     concerns don't pollute auth concerns.
//   - This file MUST end with export {} to be treated as a module
//     and have its declare global apply.
//
// IMPORTANT: This is a .d.ts file. It can only contain types and
// type-only imports. No runtime code allowed.

import type { Types } from "mongoose";
import type { Role }  from "../../shared/rbac/permissions.js";

// ============================================================
// AUTHENTICATED USER
// ============================================================

/**
 * Auth source — how was this user authenticated for the current request?
 * Useful for audit logging and security policies that vary by auth type.
 *   - "jwt"          : standard bearer token (most requests)
 *   - "session"      : cookie-based session
 *   - "api-key"      : machine-to-machine auth via API key
 *   - "impersonation": SUPER_ADMIN acting as another user (debugging)
 *   - "service"      : internal service-to-service auth
 */
export type AuthSource =
  | "jwt"
  | "session"
  | "api-key"
  | "impersonation"
  | "service";

/**
 * Shape of req.user after authentication middleware runs.
 *
 * Intentionally narrower than the full IUser document — carries only
 * what the request layer actually needs:
 *   - identity (id, _id)
 *   - tenancy (organizationId)
 *   - authorization (role, permissions)
 *
 * Handlers that need full user data (preferences, billing history,
 * profile details) should fetch via the user service rather than
 * bloating the request payload. Keep req.user lean.
 */
export interface AuthenticatedUser {
  /* ── Identity ── */

  /** String form of the user ID — preferred in handlers and logs */
  id: string;

  /**
   * Raw ObjectId for direct DB queries. In practice most callers should
   * use id (string) and let Mongoose coerce. This field exists for
   * the cases where you genuinely have an ObjectId in hand.
   */
  _id: Types.ObjectId | string;

  /* ── Tenancy ── */

  /** Organization the user belongs to. Required for every authenticated request. */
  organizationId: string;

  /** Optional display name of the org — surfaces in logs and UI shortcuts */
  organizationName?: string;

  /* ── Authorization ── */

  /**
   * Primary role. Single source of truth: Role type from permissions.ts.
   * Adding a new role here means adding to permissions.ts first.
   */
  role: Role;

  /**
   * Effective permissions computed at auth time. May be undefined if
   * the request uses a lightweight auth path that only resolves the role.
   * Middleware that needs permissions checks should call the rbac service
   * to resolve them if missing.
   */
  permissions?: readonly string[];

  /* ── Profile basics (optional) ── */

  /** Email of the authenticated user — useful in audit logs */
  email?: string;

  /** Display name — surfaces in audit logs and notifications */
  name?: string;

  /* ── Auth metadata ── */

  /** How this user authenticated for the current request */
  authSource?: AuthSource;

  /**
   * If authSource === "impersonation", the userId of the actual
   * SUPER_ADMIN actor performing the impersonation. Audit logs
   * MUST record this so impersonation actions are traceable.
   */
  impersonatorId?: string;

  /* ── Session / token metadata ── */

  /** Session identifier (cookie-based auth) or null for JWT-only flows */
  sessionId?: string;

  /** JWT jti claim — unique identifier for this specific token */
  tokenId?: string;

  /** When the auth credential was issued — unix timestamp (seconds) */
  issuedAt?: number;

  /** When the auth credential expires — unix timestamp (seconds) */
  expiresAt?: number;
}

// ============================================================
// PLAN CONTEXT
// ============================================================

/**
 * Plan context attached by limit.guard.ts and billing guards.
 * Lets downstream handlers render plan-aware UI / responses without
 * re-fetching the org.
 */
export interface PlanContext {
  organizationId: string;
  planTier:       string;
  features:       Record<string, number | boolean>;
}

// ============================================================
// BILLING STATE
// ============================================================

/**
 * Billing state attached by billing.guard.ts for soft-degrade reads.
 * If degraded === true, the user is past-due / unpaid but allowed to
 * READ. Mutations are blocked at the route layer.
 */
export interface BillingState {
  status:       string;
  degraded:     boolean;
  reason?:      string;
  graceUntil?:  Date;
}

// ============================================================
// REQUEST CONTEXT — tracing & observability
// ============================================================

/**
 * Per-request context attached by upstream middleware.
 * Used by audit logger, structured logger, and tracing.
 */
export interface RequestContext {
  /** Stable identifier — survives across log lines for correlation */
  requestId: string;

  /** Client IP — already trust-proxy-resolved */
  ip: string;

  /** User agent header — truncated to 200 chars by request logger */
  userAgent?: string;

  /** Origin header from CORS preflight */
  origin?: string;

  /** Referrer header */
  referer?: string;

  /** When the request handler started — process.hrtime.bigint() */
  startedAt: bigint;

  /** When the request handler started in wall-clock — ISO timestamp */
  startedAtIso: string;

  /** Country code from CDN if available (Cloudflare, AWS) */
  country?: string;

  /** Trace ID for distributed tracing (OpenTelemetry, Datadog) */
  traceId?: string;

  /** Span ID for distributed tracing */
  spanId?: string;
}

// ============================================================
// RATE LIMIT METADATA
// ============================================================

export interface RateLimitInfo {
  limit:     number;
  remaining: number;
  resetAt:   Date;
}

// ============================================================
// VALIDATED INPUT
// ============================================================

/**
 * Container for Zod-validated input. Populated by validation middleware
 * so handlers can use req.validated.body without casts.
 */
export interface ValidatedInput {
  body?:   unknown;
  query?:  unknown;
  params?: unknown;
}

// ============================================================
// GLOBAL EXPRESS AUGMENTATION
// ============================================================

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends AuthenticatedUser {}

    interface Request {
      /* ── Auth — populated by protect middleware ── */
      user?: AuthenticatedUser;

      /* ── Tracing context — populated by request-id / request-logger ── */
      context?: RequestContext;

      /* ── Request ID convenience accessor (also in context.requestId) ── */
      requestId?: string;

      /* ── Tenant scope ── */

      /**
       * Resolved org ID for the current request. Usually equals
       * req.user.organizationId, but may differ when SUPER_ADMIN uses
       * X-Tenant-Override header. Always prefer this over user.organizationId
       * for multi-tenant queries.
       */
      effectiveOrganizationId?: string;

      /** True when SUPER_ADMIN is acting on another org via X-Tenant-Override */
      isCrossTenantAccess?: boolean;

      /* ── Plan & billing context ── */

      /** Plan features attached by limit.guard.ts */
      planContext?: PlanContext;

      /** Billing state attached by billing.guard.ts */
      billingState?: BillingState;

      /** Set to true by billing.guard when serving in soft-degraded mode */
      billingDegraded?: boolean;

      /* ── Convenience auth flags ── */

      /** True when protect middleware confirmed valid auth */
      isAuthenticated?: boolean;

      /** True when authenticated user has admin-level role */
      isAdmin?: boolean;

      /** True when authenticated user has SUPER_ADMIN role */
      isSuperAdmin?: boolean;

      /* ── Rate limiting ── */

      rateLimit?: RateLimitInfo;

      /* ── Validated input ── */

      validated?: ValidatedInput;

      /* ── Raw body for webhook signature verification ──
       *
       * Stripe and other webhook providers require the raw bytes for
       * HMAC signature verification. Mount express.raw() on those routes
       * BEFORE express.json() so this field is populated.
       */
      rawBody?: Buffer;
    }

    interface Response {
      /** Per-response start time for performance logging */
      startTime?: number;

      /** Set to true by error handler to prevent double-error handling */
      hasErrored?: boolean;
    }
  }
}

// ============================================================
// CONVENIENCE TYPES — use these in controllers
// ============================================================

/**
 * Controller-facing request type that asserts auth ran. Use in any
 * route that requires authentication — user is non-optional, so TS
 * narrows correctly without manual if (!req.user) checks.
 *
 * Pair with asyncHandler<AuthenticatedRequest>(async (req, res) => { ... })
 * for full type inference.
 */
export interface AuthenticatedRequest extends Express.Request {
  user:                    AuthenticatedUser;
  effectiveOrganizationId: string;
}

/**
 * For endpoints where auth is optional (public + signed-in views —
 * pricing pages, public profiles, marketing pages).
 */
export interface OptionalAuthRequest extends Express.Request {
  user?: AuthenticatedUser;
}

/**
 * Strictly typed validated input. Use after a Zod validation middleware
 * has parsed the request.
 *
 * Example:
 *   type Input = z.infer<typeof createDealSchema>;
 *   async (req: ValidatedRequest<Input>, res, next) => {
 *     const dealData = req.validated.body;  // typed as Input
 *   }
 */
export interface ValidatedRequest<
  TBody   = unknown,
  TQuery  = unknown,
  TParams = unknown,
> extends AuthenticatedRequest {
  validated: {
    body:   TBody;
    query:  TQuery;
    params: TParams;
  };
}

/**
 * Webhook request type — for endpoints that need access to the raw
 * body for signature verification (Stripe, GitHub, etc.).
 */
export interface WebhookRequest extends Express.Request {
  rawBody: Buffer;
}

/* Required for this file to be treated as a module so the
   global augmentation applies correctly. */
export {};





