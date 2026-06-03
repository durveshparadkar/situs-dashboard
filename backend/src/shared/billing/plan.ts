// plans.ts
//
// Single source of truth for SaaS plan configuration. Imported by:
//   - billing.controller.ts  — plan validation, Stripe price IDs
//   - billing.webhook.ts      — syncing plan from Stripe metadata
//   - limit.guard.ts          — enforcing user/team/usage caps
//   - frontend pricing pages  — displaying plan tiers
//
// Plans are immutable in code (as const). New plans require a code
// change + deploy — intentional, since plan definitions are
// commercially significant and need version control.

// ============================================================
// CURRENCY
// ============================================================

/**
 * Default billing currency. Indian market = INR.
 * Stripe handles cross-currency conversion automatically for
 * international customers via their checkout.
 */
export const DEFAULT_CURRENCY = "INR" as const;

export type Currency = "INR" | "USD" | "EUR" | "GBP";

// ============================================================
// PLAN TIERS
// ============================================================

/**
 * Plan tier identifiers in priority order. Order matters — used for
 * upgrade/downgrade comparisons. Higher index = higher tier.
 */
export const PLAN_TIERS = ["FREE", "SMALL", "PRO", "ENTERPRISE"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/**
 * Plan tiers that require billing (i.e. non-FREE).
 */
export const PAID_PLAN_TIERS = ["SMALL", "PRO", "ENTERPRISE"] as const;
export type PaidPlanTier = (typeof PAID_PLAN_TIERS)[number];

// ============================================================
// FEATURE FLAGS
// ============================================================

/**
 * Granular feature catalogue. Each feature can be independently
 * gated per plan tier at the controller layer.
 */
export interface PlanFeatures {
  // -- Quotas --
  maxUsers:            number;
  maxTeams:            number;
  maxPipelines:        number;
  maxActiveDeals:      number;
  maxAiCallsPerMonth:  number;
  maxStorageMb:        number;

  // -- Capabilities --
  customRoles:         boolean;
  ssoEnabled:          boolean;
  apiAccess:           boolean;
  webhooksEnabled:     boolean;
  prioritySupport:     boolean;
  whiteLabel:          boolean;
  exportEnabled:       boolean;
  auditLogsEnabled:    boolean;
  advancedAnalytics:   boolean;
}

// ============================================================
// PLAN DEFINITION
// ============================================================

export interface PlanDefinition {
  /** Display name shown in UI */
  displayName:       string;

  /** Short marketing description */
  description:       string;

  /** Tier identifier */
  tier:              PlanTier;

  /** Whether this plan can be purchased (FREE is always assigned, not purchased) */
  purchasable:       boolean;

  // -- Pricing (in smallest currency unit — paise for INR, cents for USD) --
  /** Monthly price in smallest currency unit (e.g. 1900 = ₹19.00) */
  priceMonthly:      number;

  /** Annual price in smallest currency unit (typically with discount) */
  priceAnnual:       number;

  /** Currency code */
  currency:          Currency;

  // -- Stripe integration --
  /** Stripe Price ID for monthly billing (loaded from env at runtime) */
  stripePriceMonthlyEnvKey: string;

  /** Stripe Price ID for annual billing */
  stripePriceAnnualEnvKey:  string;

  // -- Trial --
  /** Days of trial offered when subscribing to this plan */
  trialDays:         number;

  // -- Features --
  features:          PlanFeatures;

  // -- Display ordering --
  /** Sort order for pricing pages (lower = earlier) */
  displayOrder:      number;

  /** Whether this is the "recommended" plan in marketing UI */
  recommended:       boolean;
}

// ============================================================
// PLAN CATALOG
// ============================================================

/**
 * Prices stored in smallest currency unit (paise for INR).
 * Display logic divides by 100 for rupee display.
 *
 * Example: priceMonthly: 1900 = ₹19.00/month
 * Annual prices include ~17% discount (10 months for the price of 12).
 */
export const PLANS: Record<PlanTier, PlanDefinition> = {

  FREE: {
    displayName: "Free",
    description: "For individuals exploring Situs",
    tier:        "FREE",
    purchasable: false,

    priceMonthly:  0,
    priceAnnual:   0,
    currency:      DEFAULT_CURRENCY,

    stripePriceMonthlyEnvKey: "",
    stripePriceAnnualEnvKey:  "",

    trialDays:    0,
    displayOrder: 0,
    recommended:  false,

    features: {
      maxUsers:            1,
      maxTeams:            1,
      maxPipelines:        1,
      maxActiveDeals:      50,
      maxAiCallsPerMonth:  100,
      maxStorageMb:        100,

      customRoles:         false,
      ssoEnabled:          false,
      apiAccess:           false,
      webhooksEnabled:     false,
      prioritySupport:     false,
      whiteLabel:          false,
      exportEnabled:       false,
      auditLogsEnabled:    false,
      advancedAnalytics:   false,
    },
  },

  SMALL: {
    displayName: "Small Business",
    description: "For small sales teams getting started",
    tier:        "SMALL",
    purchasable: true,

    priceMonthly:  1_900,    // ₹19.00 /mo
    priceAnnual:  19_000,    // ₹190 /yr (~17% off)
    currency:      DEFAULT_CURRENCY,

    stripePriceMonthlyEnvKey: "STRIPE_PRICE_SMALL_MONTHLY",
    stripePriceAnnualEnvKey:  "STRIPE_PRICE_SMALL_ANNUAL",

    trialDays:    14,
    displayOrder: 1,
    recommended:  false,

    features: {
      maxUsers:            5,
      maxTeams:            2,
      maxPipelines:        3,
      maxActiveDeals:      500,
      maxAiCallsPerMonth:  2_000,
      maxStorageMb:        2_048,

      customRoles:         false,
      ssoEnabled:          false,
      apiAccess:           false,
      webhooksEnabled:     false,
      prioritySupport:     false,
      whiteLabel:          false,
      exportEnabled:       true,
      auditLogsEnabled:    false,
      advancedAnalytics:   true,
    },
  },

  PRO: {
    displayName: "Pro",
    description: "For growing sales teams that need more power",
    tier:        "PRO",
    purchasable: true,

    priceMonthly:  4_900,    // ₹49.00 /mo
    priceAnnual:  49_000,    // ₹490 /yr
    currency:      DEFAULT_CURRENCY,

    stripePriceMonthlyEnvKey: "STRIPE_PRICE_PRO_MONTHLY",
    stripePriceAnnualEnvKey:  "STRIPE_PRICE_PRO_ANNUAL",

    trialDays:    14,
    displayOrder: 2,
    recommended:  true,       // marked as "most popular" in UI

    features: {
      maxUsers:            25,
      maxTeams:            10,
      maxPipelines:        20,
      maxActiveDeals:      5_000,
      maxAiCallsPerMonth:  20_000,
      maxStorageMb:        20_480,

      customRoles:         true,
      ssoEnabled:          false,
      apiAccess:           true,
      webhooksEnabled:     true,
      prioritySupport:     false,
      whiteLabel:          false,
      exportEnabled:       true,
      auditLogsEnabled:    true,
      advancedAnalytics:   true,
    },
  },

  ENTERPRISE: {
    displayName: "Enterprise",
    description: "For organizations with advanced security & scale needs",
    tier:        "ENTERPRISE",
    purchasable: true,

    priceMonthly:  19_900,    // ₹199.00 /mo
    priceAnnual:  199_000,    // ₹1,990 /yr
    currency:      DEFAULT_CURRENCY,

    stripePriceMonthlyEnvKey: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    stripePriceAnnualEnvKey:  "STRIPE_PRICE_ENTERPRISE_ANNUAL",

    trialDays:    30,
    displayOrder: 3,
    recommended:  false,

    features: {
      maxUsers:            30,
      maxTeams:            20,
      maxPipelines:        100,
      maxActiveDeals:      50_000,
      maxAiCallsPerMonth:  200_000,
      maxStorageMb:        102_400,

      customRoles:         true,
      ssoEnabled:          true,
      apiAccess:           true,
      webhooksEnabled:     true,
      prioritySupport:     true,
      whiteLabel:          true,
      exportEnabled:       true,
      auditLogsEnabled:    true,
      advancedAnalytics:   true,
    },
  },

} as const;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Look up a plan by tier. Returns null for invalid tiers (defensive
 * against external input).
 */
export function getPlan(tier: string | null | undefined): PlanDefinition | null {
  if (!tier) return null;
  const normalized = (
    tier.toUpperCase() === "SMALL_BUSINESS" ? "SMALL" : tier.toUpperCase()
  ) as PlanTier;
  return (PLANS as Record<string, PlanDefinition>)[normalized] ?? null;
}

/**
 * Get the Stripe Price ID for a plan + billing cycle.
 * Reads from env at call time (not module load) so price rotations
 * take effect on the next request without a restart.
 *
 * Returns null if the plan isn't purchasable, the cycle is invalid,
 * or the env var isn't configured.
 */
export function getStripePriceId(
  tier:  PlanTier,
  cycle: "monthly" | "annual"
): string | null {
  const plan = PLANS[tier];
  if (!plan || !plan.purchasable) return null;

  const envKey =
    cycle === "monthly"
      ? plan.stripePriceMonthlyEnvKey
      : plan.stripePriceAnnualEnvKey;

  if (!envKey) return null;
  const priceId = process.env[envKey];
  return priceId && priceId.length > 0 ? priceId : null;
}

/**
 * Compare two plans by tier ordering. Returns:
 *   positive  if a is higher tier than b
 *   negative  if a is lower tier
 *   zero      if same tier
 *
 * Use cases: "is this an upgrade or downgrade?" and access checks.
 */
export function comparePlans(a: PlanTier, b: PlanTier): number {
  const idxA = PLAN_TIERS.indexOf(a);
  const idxB = PLAN_TIERS.indexOf(b);
  return idxA - idxB;
}

/**
 * Check whether a plan has access to a specific boolean feature.
 *
 * Example:
 *   if (!hasFeature(org.plan, "apiAccess")) {
 *     throw new AppError("Upgrade to Pro for API access", 403, "FEATURE_GATED");
 *   }
 */
export function hasFeature(
  tier:    PlanTier | string | null | undefined,
  feature: keyof PlanFeatures
): boolean {
  const plan = getPlan(typeof tier === "string" ? tier : null);
  if (!plan) return false;
  const value = plan.features[feature];
  return typeof value === "boolean" ? value : false;
}

/**
 * Read a numeric quota for a plan (max users, max teams, etc).
 * Returns 0 for invalid plans (effectively denies all access).
 */
export function getQuota(
  tier:    PlanTier | string | null | undefined,
  quota:   keyof PlanFeatures
): number {
  const plan = getPlan(typeof tier === "string" ? tier : null);
  if (!plan) return 0;
  const value = plan.features[quota];
  return typeof value === "number" ? value : 0;
}

/**
 * Check whether a tier identifier is a valid, purchasable plan.
 */
export function isPaidPlan(tier: string | null | undefined): tier is PaidPlanTier {
  if (!tier) return false;
  return (PAID_PLAN_TIERS as readonly string[]).includes(tier.toUpperCase());
}

/**
 * Get all plans sorted for UI display.
 */
export function getPublicPlans(): PlanDefinition[] {
  return Object.values(PLANS)
    .filter((p) => p.purchasable || p.tier === "FREE")
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Format a price (smallest currency unit) for human display.
 * Example: formatPrice(1900, "INR") → "₹19"
 */
export function formatPrice(
  amountInSmallestUnit: number,
  currency:             Currency = DEFAULT_CURRENCY
): string {
  const major = amountInSmallestUnit / 100;
  switch (currency) {
    case "INR": return "₹" + major.toLocaleString("en-IN");
    case "USD": return "$" + major.toLocaleString("en-US");
    case "EUR": return "€" + major.toLocaleString("de-DE");
    case "GBP": return "£" + major.toLocaleString("en-GB");
    default:    return major.toString();
  }
}

// ============================================================
// LEGACY EXPORT
// Backward-compatible with the old export shape.
// @deprecated Use PLAN_TIERS or PAID_PLAN_TIERS instead.
// ============================================================

/**
 * @deprecated Use PlanTier or PaidPlanTier instead.
 */
export type Plan = PlanTier;

export default PLANS;
