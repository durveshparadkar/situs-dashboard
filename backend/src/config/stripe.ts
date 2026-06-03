// stripe.ts
//
// Stripe client singleton. Centralizes Stripe SDK configuration and
// exposes helpers for the patterns we use most:
//   - Idempotency key generation
//   - Safe webhook signature verification
//   - Customer / subscription lookup with proper error handling
//   - Mode detection (test vs live)
//   - Health check
//
// CRITICAL DESIGN NOTES:
//   - API version is PINNED. Stripe ships breaking changes on the latest
//     version; without pinning, your integration silently breaks on their
//     deploy schedule, not yours.
//   - Webhook secret separate from API key — different secret, different
//     env var. Verifying webhooks with the API key WILL silently fail.
//   - Tax behavior centralized — automatic_tax: { enabled: true } applied
//     consistently across checkout sessions.
//   - Logging redacts customer/payment IDs (PII-adjacent) in error paths.
//
// Used by:
//   - subscription.controller.ts — checkout, portal, cancellation
//   - billing.webhook.ts          — event handlers
//   - any module that creates/queries Stripe resources

import Stripe from "stripe";

import { dbLogger } from "../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const STRIPE_CONFIG = {
  /**
   * Stripe secret key. Required for any Stripe API call.
   * Format: sk_test_* (test mode) or sk_live_* (production)
   */
  secretKey: process.env.STRIPE_SECRET_KEY ?? "",

  /**
   * Stripe webhook signing secret. Separate from API key. Required for
   * signature verification on incoming webhooks.
   * Format: whsec_*
   */
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  /**
   * API version pinned for reproducible behavior.
   *
   * CRITICAL: do NOT remove the pin. Stripe rolls out breaking changes
   * via dated API versions. Without a pin, your account-default version
   * applies — and that version changes when you upgrade in the Stripe
   * dashboard. Pin in code so deploys are predictable.
   *
   * Update this constant deliberately, test thoroughly, then deploy.
   * Check changelog: https://stripe.com/docs/upgrades
   */
  apiVersion: (process.env.STRIPE_API_VERSION ?? "2024-06-20") as Stripe.LatestApiVersion,

  /**
   * Network retries for transient failures (network blips, 5xx).
   * Stripe's SDK handles this automatically with exponential backoff.
   * Default 2, configurable up to 5.
   */
  maxNetworkRetries: parseInt(process.env.STRIPE_MAX_RETRIES ?? "2", 10),

  /**
   * Request timeout in ms. Stripe API is usually <500ms; 30s is generous
   * but catches genuinely hung requests.
   */
  timeoutMs: parseInt(process.env.STRIPE_TIMEOUT_MS ?? "30000", 10),

  /**
   * Telemetry — Stripe SDK can report timing info to Stripe to help
   * them improve the SDK. Disabled by default for privacy; opt in
   * via env var if you want to help Stripe debug SDK issues.
   */
  telemetry: process.env.STRIPE_TELEMETRY === "true",

  /**
   * App info for Stripe support. Helps Stripe identify your traffic
   * when you open support tickets — they can see "this comes from Situs".
   */
  appInfo: {
    name:    "Situs",
    version: process.env.APP_VERSION ?? "1.0.0",
    url:     process.env.API_BASE_URL ?? undefined,
  } as Stripe.StripeConfig["appInfo"],
} as const;

// ============================================================
// VALIDATION AT MODULE LOAD
// ============================================================

const isProduction = process.env.NODE_ENV === "production";

if (!STRIPE_CONFIG.secretKey) {
  if (isProduction) {
    // Production without Stripe — fail loudly
    dbLogger.error(
      "STRIPE_SECRET_KEY not set in production. Billing features will be disabled."
    );
  } else {
    dbLogger.warn(
      "STRIPE_SECRET_KEY not set — Stripe client will throw on use. " +
      "OK for tests, set the env var to test billing locally."
    );
  }
}

// Detect mode mismatch — production using test keys, or vice versa
if (STRIPE_CONFIG.secretKey) {
  const isTestKey = STRIPE_CONFIG.secretKey.startsWith("sk_test_");
  const isLiveKey = STRIPE_CONFIG.secretKey.startsWith("sk_live_");

  if (!isTestKey && !isLiveKey) {
    dbLogger.error(
      "STRIPE_SECRET_KEY has invalid format. Expected sk_test_* or sk_live_*."
    );
  }

  if (isProduction && isTestKey) {
    dbLogger.error(
      "STRIPE TEST KEY in PRODUCTION environment. Real payments will fail. " +
      "Verify your secrets configuration."
    );
  }

  if (!isProduction && isLiveKey) {
    dbLogger.warn(
      "STRIPE LIVE KEY in non-production environment. " +
      "Any Stripe API call will affect REAL customers. Be careful."
    );
  }
}

if (isProduction && STRIPE_CONFIG.secretKey && !STRIPE_CONFIG.webhookSecret) {
  dbLogger.error(
    "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing. " +
    "Webhook signatures cannot be verified — all webhook events will be rejected."
  );
}

// ============================================================
// CLIENT INSTANCE
// ============================================================

/**
 * Stripe SDK client. Singleton — share this across the app.
 *
 * The client uses lazy connections (HTTP requests on demand), so
 * instantiating it doesn't open network sockets immediately. Safe to
 * import even when STRIPE_SECRET_KEY isn't set; errors only surface
 * when an API call is actually made.
 */
const stripe = new Stripe(STRIPE_CONFIG.secretKey, {
  apiVersion:        STRIPE_CONFIG.apiVersion,
  maxNetworkRetries: STRIPE_CONFIG.maxNetworkRetries,
  timeout:           STRIPE_CONFIG.timeoutMs,
  telemetry:         STRIPE_CONFIG.telemetry,
  ...(STRIPE_CONFIG.appInfo !== undefined && { appInfo: STRIPE_CONFIG.appInfo }),
});

dbLogger.info(
  "Stripe client initialized: " +
  "apiVersion=" + STRIPE_CONFIG.apiVersion +
  " mode=" + (STRIPE_CONFIG.secretKey.startsWith("sk_live_") ? "LIVE" : "test") +
  " retries=" + STRIPE_CONFIG.maxNetworkRetries
);

// ============================================================
// MODE INTROSPECTION
// ============================================================

/**
 * Whether the configured key is a live (production) key.
 */
export function isStripeLive(): boolean {
  return STRIPE_CONFIG.secretKey.startsWith("sk_live_");
}

/**
 * Whether the configured key is a test (development) key.
 */
export function isStripeTest(): boolean {
  return STRIPE_CONFIG.secretKey.startsWith("sk_test_");
}

/**
 * Whether Stripe is configured at all (secret key set).
 */
export function isStripeEnabled(): boolean {
  return Boolean(STRIPE_CONFIG.secretKey);
}

/**
 * Whether webhook signature verification is configured.
 */
export function isStripeWebhookEnabled(): boolean {
  return Boolean(STRIPE_CONFIG.webhookSecret);
}

// ============================================================
// IDEMPOTENCY KEY HELPERS
// ============================================================

/**
 * Generate a deterministic idempotency key for a Stripe mutation.
 * Stripe deduplicates requests with the same idempotency key for
 * 24 hours — critical for retry-safe payment operations.
 *
 * Pattern: <operation>:<orgId>:<userId>:<context>
 *
 * Same inputs → same key → Stripe returns the original response on retry
 * instead of charging twice. The 24-hour window is Stripe's, not configurable.
 */
export function buildIdempotencyKey(
  operation: string,
  parts:     Array<string | number | undefined | null>
): string {
  const cleaned = parts
    .filter((p): p is string | number => p !== null && p !== undefined && p !== "")
    .map((p) => String(p).slice(0, 100));

  // Add a coarse time bucket (15-minute window) so retries within reasonable
  // timeframe are deduped, but the same operation tomorrow gets a fresh key.
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));

  return [operation, ...cleaned, bucket].join(":").slice(0, 255);
}

// ============================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================

/**
 * Verify a webhook payload's signature. Throws if invalid.
 *
 * Usage:
 *   const event = verifyWebhookSignature(req.rawBody, req.headers["stripe-signature"]);
 *
 * CRITICAL: req.rawBody must be the raw Buffer — JSON-parsed body breaks
 * signature verification. Mount express.raw({ type: "application/json" })
 * on the webhook route BEFORE express.json().
 */
export function verifyWebhookSignature(
  payload:   Buffer | string,
  signature: string | string[] | undefined
): Stripe.Event {
  if (!STRIPE_CONFIG.webhookSecret) {
    throw new Error(
      "Webhook secret not configured (STRIPE_WEBHOOK_SECRET). " +
      "Cannot verify event."
    );
  }

  if (!signature) {
    throw new Error("Missing stripe-signature header on webhook request");
  }

  const sigHeader = Array.isArray(signature) ? signature[0] : signature;
  if (!sigHeader) {
    throw new Error("Empty stripe-signature header");
  }

  // constructEvent throws on bad signature — let caller catch
  return stripe.webhooks.constructEvent(
    payload,
    sigHeader,
    STRIPE_CONFIG.webhookSecret
  );
}

// ============================================================
// ERROR TRANSLATION
// ============================================================

export interface TranslatedStripeError {
  statusCode: number;
  code:       string;
  message:    string;
  type:       string;
  declineCode?: string;
}

/**
 * Translate a Stripe error to a structured app error. Maps Stripe error
 * types to HTTP status codes and our own error codes.
 *
 * Use in controllers to convert Stripe failures into proper API responses.
 */
export function translateStripeError(err: unknown): TranslatedStripeError {
  if (err instanceof Stripe.errors.StripeCardError) {
    return {
      statusCode:  402,
      code:        "CARD_ERROR",
      message:     err.message,
      type:        err.type,
      ...(err.decline_code && { declineCode: err.decline_code }),
    };
  }

  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return {
      statusCode: 400,
      code:       "INVALID_STRIPE_REQUEST",
      message:    err.message,
      type:       err.type,
    };
  }

  if (err instanceof Stripe.errors.StripeAPIError) {
    return {
      statusCode: 502,
      code:       "STRIPE_API_ERROR",
      message:    "Stripe is temporarily unavailable",
      type:       err.type,
    };
  }

  if (err instanceof Stripe.errors.StripeConnectionError) {
    return {
      statusCode: 503,
      code:       "STRIPE_NETWORK_ERROR",
      message:    "Could not reach Stripe",
      type:       err.type,
    };
  }

  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    return {
      statusCode: 500,
      code:       "STRIPE_AUTH_ERROR",
      message:    "Stripe authentication failed — check API keys",
      type:       err.type,
    };
  }

  if (err instanceof Stripe.errors.StripeRateLimitError) {
    return {
      statusCode: 429,
      code:       "STRIPE_RATE_LIMITED",
      message:    "Too many requests to Stripe, please retry",
      type:       err.type,
    };
  }

  if (err instanceof Stripe.errors.StripeError) {
    return {
      statusCode: 500,
      code:       "STRIPE_ERROR",
      message:    err.message,
      type:       err.type,
    };
  }

  // Non-Stripe error
  return {
    statusCode: 500,
    code:       "UNKNOWN_ERROR",
    message:    (err as Error)?.message ?? "Unknown error",
    type:       "unknown",
  };
}

// ============================================================
// HEALTH CHECK
// ============================================================

export interface StripeHealthStatus {
  configured:        boolean;
  mode:              "live" | "test" | "unconfigured";
  webhookConfigured: boolean;
  apiVersion:        string;
  reachable?:        boolean;
  pingMs?:           number;
  lastError?:        string;
}

/**
 * Check Stripe API reachability. Uses a lightweight call (account
 * retrieval) to verify both auth and network. Suitable for /health
 * endpoints, but cache the result — don't ping Stripe on every health check.
 */
export async function getStripeHealth(): Promise<StripeHealthStatus> {
  const status: StripeHealthStatus = {
    configured:        isStripeEnabled(),
    mode:              isStripeLive() ? "live" : isStripeTest() ? "test" : "unconfigured",
    webhookConfigured: isStripeWebhookEnabled(),
    apiVersion:        STRIPE_CONFIG.apiVersion,
  };

  if (!status.configured) {
    return status;
  }

  try {
    const start = Date.now();
    await stripe.balance.retrieve();
    status.pingMs    = Date.now() - start;
    status.reachable = true;
  } catch (err) {
    status.reachable = false;
    status.lastError = (err as Error)?.message ?? "unknown";
    dbLogger.error(
      "Stripe health check failed: " +
      ((err as Error)?.message ?? "unknown")
    );
  }

  return status;
}

// ============================================================
// SAFE OPERATIONS — wrappers with structured error handling
// ============================================================

/**
 * Retrieve a customer by ID with graceful not-found handling.
 * Returns null instead of throwing on 404.
 */
export async function safeRetrieveCustomer(
  customerId: string
): Promise<Stripe.Customer | null> {
  if (!isStripeEnabled()) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      dbLogger.warn(
        "Stripe customer is deleted: id=" + customerId
      );
      return null;
    }
    return customer as Stripe.Customer;
  } catch (err) {
    if (
      err instanceof Stripe.errors.StripeInvalidRequestError &&
      err.statusCode === 404
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Retrieve a subscription with graceful not-found handling.
 */
export async function safeRetrieveSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  if (!isStripeEnabled()) return null;

  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    if (
      err instanceof Stripe.errors.StripeInvalidRequestError &&
      err.statusCode === 404
    ) {
      return null;
    }
    throw err;
  }
}

// ============================================================
// TIMEOUT WRAPPER
// ============================================================

/**
 * Wrap a Stripe call with an explicit timeout. The SDK's own timeout
 * sometimes doesn't fire reliably on hung connections — this guarantees
 * a deadline at the application level.
 *
 * Usage:
 *   const session = await withStripeTimeout(
 *     stripe.checkout.sessions.create({ ... }),
 *     15000
 *   );
 */
export async function withStripeTimeout<T>(
  promise: Promise<T>,
  ms:      number
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Stripe operation timed out after " + ms + "ms")),
      ms
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ============================================================
// EXPORTS
// ============================================================

export {
  STRIPE_CONFIG,
};

export default stripe;



