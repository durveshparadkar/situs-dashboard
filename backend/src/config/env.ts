// env.ts
//
// Environment configuration with fail-fast validation.
//
// Loads, validates, and types all environment variables in one place.
// Validation runs at module load time — if required vars are missing
// or malformed, the process exits IMMEDIATELY with a clear error message.
//
// Design principles:
//   - Fail fast: missing required vars exit the process before app starts
//   - Type-safe: every export has a concrete TS type, no string-typed maybes
//   - No silent defaults for secrets: jwtSecret has no fallback in production
//   - Categorized config: server, db, auth, billing, integrations grouped
//   - Single import site: import { env } from "./config/env.js"
//
// Usage:
//   import { env } from "./config/env.js";
//
//   app.listen(env.server.port);
//   await connectDB(env.db.mongoUri);

import { z } from "zod";

// ============================================================
// LOAD DOTENV IF AVAILABLE
// dotenv should be loaded BEFORE this file is imported. Most apps
// import dotenv/config at the top of their entry file. This module
// just reads from process.env.
// ============================================================

// ============================================================
// ENV NAME HELPERS
// ============================================================

const NODE_ENV = String(process.env.NODE_ENV ?? "development").toLowerCase();
const IS_PRODUCTION  = NODE_ENV === "production";
const IS_DEVELOPMENT = NODE_ENV === "development";
const IS_TEST        = NODE_ENV === "test";

// ============================================================
// ZOD SCHEMA
// ============================================================

/**
 * Custom string-to-number coercion that rejects non-numeric strings.
 * Zod's default coerce.number() accepts "abc" and returns NaN.
 */
const numericString = (defaultValue?: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") {
        if (defaultValue !== undefined) return defaultValue;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required numeric value",
        });
        return z.NEVER;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a valid number, got: " + v,
        });
        return z.NEVER;
      }
      return n;
    });

const booleanString = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return defaultValue;
      return v.toLowerCase() === "true" || v === "1";
    });

const envSchema = z.object({

  // -----------------------------------------------------------
  // SERVER
  // -----------------------------------------------------------
  NODE_ENV: z
    .enum(["development", "production", "test", "staging"])
    .default("development"),

  PORT: numericString(5000),

  HOST: z.string().default("0.0.0.0"),

  /** Public-facing URL of the API — used in webhook URLs, redirects */
  API_BASE_URL: z.string().url().optional(),

  /** Public-facing URL of the frontend — used for redirects, emails */
  FRONTEND_URL: z.string().url().optional(),

  /** Trust proxy hops (1 = behind one LB, 2 = behind two, etc.) */
  TRUST_PROXY: numericString(1),

  // -----------------------------------------------------------
  // DATABASE
  // -----------------------------------------------------------

  MONGO_URI: z
    .string()
    .min(1, "MONGO_URI is required")
    .refine(
      (v) => v.startsWith("mongodb://") || v.startsWith("mongodb+srv://"),
      { message: "MONGO_URI must start with mongodb:// or mongodb+srv://" }
    ),

  REDIS_URL: z.string().optional(),

  // -----------------------------------------------------------
  // AUTHENTICATION
  // -----------------------------------------------------------

  /**
   * JWT secret. In production, MUST be a strong random value of
   * 32+ characters. The default fallback is intentionally absent —
   * we'd rather fail at startup than ship a guessable secret.
   */
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),

  JWT_EXPIRES_IN:         z.string().default("7d"),
  JWT_REFRESH_SECRET:     z.string().min(32).optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  BCRYPT_SALT_ROUNDS: numericString(10),

  /** Cookie domain for cross-subdomain auth */
  COOKIE_DOMAIN: z.string().optional(),

  /** Whether cookies are secure (HTTPS only) — default true in prod */
  COOKIE_SECURE: booleanString(IS_PRODUCTION),

  // -----------------------------------------------------------
  // BILLING (Stripe)
  // -----------------------------------------------------------

  STRIPE_SECRET_KEY:     z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_API_VERSION:    z.string().default("2024-06-20"),

  STRIPE_PRICE_SMALL_MONTHLY:          z.string().optional(),
  STRIPE_PRICE_SMALL_BUSINESS_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY:            z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_MONTHLY:     z.string().optional(),

  // -----------------------------------------------------------
  // INTEGRATIONS
  // -----------------------------------------------------------

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL:   z.string().default("gpt-4o-mini"),

  HUBSPOT_CLIENT_ID:     z.string().optional(),
  HUBSPOT_CLIENT_SECRET: z.string().optional(),

  SALESFORCE_CLIENT_ID:     z.string().optional(),
  SALESFORCE_CLIENT_SECRET: z.string().optional(),

  // -----------------------------------------------------------
  // EMAIL
  // -----------------------------------------------------------

  SMTP_HOST:    z.string().optional(),
  SMTP_PORT:    numericString(587),
  SMTP_USER:    z.string().optional(),
  SMTP_PASS:    z.string().optional(),
  EMAIL_FROM:   z.string().email().optional(),

  // -----------------------------------------------------------
  // OBSERVABILITY
  // -----------------------------------------------------------

  LOG_LEVEL: z
    .enum(["error", "warn", "info", "debug"])
    .default("info"),

  SENTRY_DSN: z.string().optional(),
});

// ============================================================
// VALIDATE
// ============================================================

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n========================================");
  console.error("❌ ENVIRONMENT VALIDATION FAILED");
  console.error("========================================\n");

  for (const issue of parsed.error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    console.error("  • " + path + ": " + issue.message);
  }

  console.error("\nReview your .env file or environment variables.");
  console.error("Required variables: MONGO_URI, JWT_SECRET");
  console.error("========================================\n");

  if (IS_TEST) {
    throw new Error("Environment validation failed");
  }
  process.exit(1);
}

const e = parsed.data;

// ============================================================
// ADDITIONAL CONTEXTUAL VALIDATION
// Cross-field rules that Zod can't express inline.
// ============================================================

const contextualWarnings: string[] = [];
const contextualErrors:   string[] = [];

// Production-only rules
if (IS_PRODUCTION) {
  if (e.JWT_SECRET === "situs_secret" || e.JWT_SECRET.length < 64) {
    contextualErrors.push(
      "JWT_SECRET in production should be a strong random value of 64+ characters"
    );
  }

  if (!e.JWT_REFRESH_SECRET) {
    contextualWarnings.push(
      "JWT_REFRESH_SECRET not set — refresh tokens will use JWT_SECRET (less secure)"
    );
  }

  if (!e.STRIPE_SECRET_KEY) {
    contextualWarnings.push(
      "STRIPE_SECRET_KEY not set — billing features will be disabled"
    );
  }

  if (e.STRIPE_SECRET_KEY && !e.STRIPE_WEBHOOK_SECRET) {
    contextualErrors.push(
      "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing — webhooks will be unverified"
    );
  }

  if (!e.API_BASE_URL) {
    contextualWarnings.push(
      "API_BASE_URL not set — webhook URLs and redirects may be malformed"
    );
  }

  if (!e.FRONTEND_URL) {
    contextualWarnings.push(
      "FRONTEND_URL not set — email links and OAuth redirects may be malformed"
    );
  }

  if (!e.SENTRY_DSN) {
    contextualWarnings.push(
      "SENTRY_DSN not set — production errors will not be tracked"
    );
  }
}

const smallBusinessMonthlyPrice =
  e.STRIPE_PRICE_SMALL_BUSINESS_MONTHLY ?? e.STRIPE_PRICE_SMALL_MONTHLY;
const isBillingEnabled = Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET);

// Cross-field rules for billing
if (isBillingEnabled) {
  const missingPrices: string[] = [];
  if (!smallBusinessMonthlyPrice)             missingPrices.push("SMALL_BUSINESS");
  if (!e.STRIPE_PRICE_PRO_MONTHLY)            missingPrices.push("PRO");
  if (!e.STRIPE_PRICE_ENTERPRISE_MONTHLY)     missingPrices.push("ENTERPRISE");

  if (missingPrices.length > 0) {
    contextualWarnings.push(
      "Stripe enabled but missing price IDs for plans: " + missingPrices.join(", ")
    );
  }
}

// SMTP all-or-nothing
const smtpFields = [e.SMTP_HOST, e.SMTP_USER, e.SMTP_PASS, e.EMAIL_FROM];
const smtpSetCount = smtpFields.filter((v) => v && v.length > 0).length;
if (smtpSetCount > 0 && smtpSetCount < 4) {
  contextualWarnings.push(
    "SMTP partially configured — email sending will fail. " +
    "Set all of SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM or none."
  );
}

// Print warnings
if (contextualWarnings.length > 0) {
  console.warn("\n⚠️  Environment warnings:");
  for (const w of contextualWarnings) {
    console.warn("  • " + w);
  }
  console.warn("");
}

// Exit on contextual errors
if (contextualErrors.length > 0) {
  console.error("\n========================================");
  console.error("❌ ENVIRONMENT CONFIGURATION ERRORS");
  console.error("========================================\n");
  for (const err of contextualErrors) {
    console.error("  • " + err);
  }
  console.error("========================================\n");

  if (IS_TEST) {
    throw new Error("Environment configuration errors");
  }
  process.exit(1);
}

// ============================================================
// CATEGORIZED EXPORT
// ============================================================

export const env = {
  // -----------------------------------------------------------
  // META
  // -----------------------------------------------------------
  nodeEnv:        e.NODE_ENV,
  isProduction:   IS_PRODUCTION,
  isDevelopment:  IS_DEVELOPMENT,
  isTest:         IS_TEST,

  // -----------------------------------------------------------
  // SERVER
  // -----------------------------------------------------------
  server: {
    port:        e.PORT,
    host:        e.HOST,
    apiBaseUrl:  e.API_BASE_URL,
    frontendUrl: e.FRONTEND_URL,
    trustProxy:  e.TRUST_PROXY,
  },

  // -----------------------------------------------------------
  // DATABASE
  // -----------------------------------------------------------
  db: {
    mongoUri: e.MONGO_URI,
    redisUrl: e.REDIS_URL,
  },

  // -----------------------------------------------------------
  // AUTHENTICATION
  // -----------------------------------------------------------
  auth: {
    jwtSecret:           e.JWT_SECRET,
    jwtExpiresIn:        e.JWT_EXPIRES_IN,
    jwtRefreshSecret:    e.JWT_REFRESH_SECRET ?? e.JWT_SECRET,
    jwtRefreshExpiresIn: e.JWT_REFRESH_EXPIRES_IN,
    bcryptSaltRounds:    e.BCRYPT_SALT_ROUNDS,
    cookieDomain:        e.COOKIE_DOMAIN,
    cookieSecure:        e.COOKIE_SECURE,
  },

  // -----------------------------------------------------------
  // BILLING
  // -----------------------------------------------------------
  billing: {
    stripeSecretKey:     e.STRIPE_SECRET_KEY,
    stripeWebhookSecret: e.STRIPE_WEBHOOK_SECRET,
    stripeApiVersion:    e.STRIPE_API_VERSION,
    isEnabled:           isBillingEnabled,
    prices: {
      smallBusinessMonthly: smallBusinessMonthlyPrice,
      proMonthly:           e.STRIPE_PRICE_PRO_MONTHLY,
      enterpriseMonthly:    e.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    },
  },

  // -----------------------------------------------------------
  // INTEGRATIONS
  // -----------------------------------------------------------
  integrations: {
    openai: {
      apiKey:    e.OPENAI_API_KEY,
      model:     e.OPENAI_MODEL,
      isEnabled: Boolean(e.OPENAI_API_KEY),
    },
    hubspot: {
      clientId:     e.HUBSPOT_CLIENT_ID,
      clientSecret: e.HUBSPOT_CLIENT_SECRET,
      isEnabled:    Boolean(e.HUBSPOT_CLIENT_ID && e.HUBSPOT_CLIENT_SECRET),
    },
    salesforce: {
      clientId:     e.SALESFORCE_CLIENT_ID,
      clientSecret: e.SALESFORCE_CLIENT_SECRET,
      isEnabled:    Boolean(e.SALESFORCE_CLIENT_ID && e.SALESFORCE_CLIENT_SECRET),
    },
  },

  // -----------------------------------------------------------
  // EMAIL
  // -----------------------------------------------------------
  email: {
    smtpHost:  e.SMTP_HOST,
    smtpPort:  e.SMTP_PORT,
    smtpUser:  e.SMTP_USER,
    smtpPass:  e.SMTP_PASS,
    from:      e.EMAIL_FROM,
    isEnabled: Boolean(
      e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS && e.EMAIL_FROM
    ),
  },

  // -----------------------------------------------------------
  // OBSERVABILITY
  // -----------------------------------------------------------
  observability: {
    logLevel:  e.LOG_LEVEL,
    sentryDsn: e.SENTRY_DSN,
  },
} as const;

// ============================================================
// TYPE EXPORTS
// ============================================================

export type Env     = typeof env;
export type NodeEnv = (typeof env)["nodeEnv"];

export default env;

