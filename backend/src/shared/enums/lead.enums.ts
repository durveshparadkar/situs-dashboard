// lead.enums.ts
//
// Universal sales lead lifecycle vocabulary for the Revenue OS decision
// intelligence platform. Designed to ingest data from any CRM (HubSpot,
// Salesforce, Pipedrive, Zoho) and produce consistent decision signals.
//
// Industries supported:
//   - B2B SaaS              (typical funnel: MQL → SQL → Opp → Closed)
//   - Professional services (consulting, agencies, legal, accounting)
//   - Manufacturing/B2B trade (industrial sales, distribution)
//   - Real estate           (residential, commercial)
//   - Fintech & insurance   (advisor-led sales)
//
// Used by:
//   - lead.model.ts        — enum validation on lead documents
//   - lead.controller.ts   — stage transition logic
//   - decision engines     — pipeline-leak-engine, deal-risk-engine, etc.
//   - dashboard widgets    — funnel visualization
//   - CRM ingestion        — HubSpot/Salesforce field normalization
//   - AI scoring           — qualification probability, win probability

// ============================================================
// LEAD STAGES — universal B2B sales funnel
// ============================================================

/**
 * Stages every B2B sale moves through, from first touch to closed.
 *
 * The model balances granularity (decision engines need signal) with
 * universality (must map cleanly from HubSpot/Salesforce/Pipedrive
 * stage names without major migrations).
 *
 * Stored as const object instead of TS enum for:
 *   1. Compatibility with exactOptionalPropertyTypes: true
 *   2. Clean iteration via Object.values
 *   3. Zero runtime overhead (no reverse-mapping table)
 *   4. Strict typing via as const + indexed access type
 */
export const LeadStage = {
  // -- TOP OF FUNNEL --
  NEW:               "NEW",                // Lead just entered the system
  CONTACTED:         "CONTACTED",          // First outreach attempted
  ENGAGED:           "ENGAGED",            // Lead responded / opened email / replied

  // -- QUALIFICATION --
  MQL:               "MQL",                // Marketing-qualified (fits ICP)
  SQL:               "SQL",                // Sales-qualified (intent + fit)
  DISQUALIFIED:      "DISQUALIFIED",       // Failed qualification (wrong fit)

  // -- ACTIVE OPPORTUNITY --
  DISCOVERY:         "DISCOVERY",          // Needs assessment / discovery call
  DEMO_SCHEDULED:    "DEMO_SCHEDULED",     // Product demo / site visit booked
  DEMO_COMPLETED:    "DEMO_COMPLETED",     // Demo done, awaiting next step
  PROPOSAL_SENT:     "PROPOSAL_SENT",      // Quote / proposal / SOW delivered
  NEGOTIATION:       "NEGOTIATION",        // Active price/terms discussion
  VERBAL_COMMIT:     "VERBAL_COMMIT",      // Customer verbally committed, paperwork pending
  CONTRACT_SENT:     "CONTRACT_SENT",      // Contract / agreement sent for signature
  CONTRACT_SIGNED:   "CONTRACT_SIGNED",    // Signed but payment / onboarding pending

  // -- TERMINAL --
  WON:               "WON",                // Deal closed-won (revenue recognized)
  LOST:              "LOST",               // Deal closed-lost (unrecoverable)

  // -- HOLDING STATES --
  ON_HOLD:           "ON_HOLD",            // Paused by customer (revisit at agreed date)
  NURTURE:           "NURTURE",            // Long-term nurture (not now, maybe later)
  COLD:              "COLD",               // Unresponsive — automated re-engagement
} as const;

export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

/**
 * Stages grouped by funnel phase — used by decision engines and
 * dashboards for aggregate signal.
 */
export const LEAD_STAGE_GROUP = {
  TOP_OF_FUNNEL: "TOP_OF_FUNNEL",
  QUALIFICATION: "QUALIFICATION",
  OPPORTUNITY:   "OPPORTUNITY",
  LATE_STAGE:    "LATE_STAGE",
  TERMINAL:      "TERMINAL",
  HOLDING:       "HOLDING",
} as const;

export type LeadStageGroup = (typeof LEAD_STAGE_GROUP)[keyof typeof LEAD_STAGE_GROUP];

export const LEAD_STAGE_TO_GROUP: Record<LeadStage, LeadStageGroup> = {
  [LeadStage.NEW]:             LEAD_STAGE_GROUP.TOP_OF_FUNNEL,
  [LeadStage.CONTACTED]:       LEAD_STAGE_GROUP.TOP_OF_FUNNEL,
  [LeadStage.ENGAGED]:         LEAD_STAGE_GROUP.TOP_OF_FUNNEL,

  [LeadStage.MQL]:             LEAD_STAGE_GROUP.QUALIFICATION,
  [LeadStage.SQL]:             LEAD_STAGE_GROUP.QUALIFICATION,
  [LeadStage.DISQUALIFIED]:    LEAD_STAGE_GROUP.QUALIFICATION,

  [LeadStage.DISCOVERY]:       LEAD_STAGE_GROUP.OPPORTUNITY,
  [LeadStage.DEMO_SCHEDULED]:  LEAD_STAGE_GROUP.OPPORTUNITY,
  [LeadStage.DEMO_COMPLETED]:  LEAD_STAGE_GROUP.OPPORTUNITY,
  [LeadStage.PROPOSAL_SENT]:   LEAD_STAGE_GROUP.OPPORTUNITY,

  [LeadStage.NEGOTIATION]:     LEAD_STAGE_GROUP.LATE_STAGE,
  [LeadStage.VERBAL_COMMIT]:   LEAD_STAGE_GROUP.LATE_STAGE,
  [LeadStage.CONTRACT_SENT]:   LEAD_STAGE_GROUP.LATE_STAGE,
  [LeadStage.CONTRACT_SIGNED]: LEAD_STAGE_GROUP.LATE_STAGE,

  [LeadStage.WON]:             LEAD_STAGE_GROUP.TERMINAL,
  [LeadStage.LOST]:            LEAD_STAGE_GROUP.TERMINAL,

  [LeadStage.ON_HOLD]:         LEAD_STAGE_GROUP.HOLDING,
  [LeadStage.NURTURE]:         LEAD_STAGE_GROUP.HOLDING,
  [LeadStage.COLD]:            LEAD_STAGE_GROUP.HOLDING,
};

/**
 * Ordered progression through the funnel (active path only).
 * Holding states (ON_HOLD, NURTURE, COLD) and terminal states are excluded.
 */
export const LEAD_STAGE_ORDER: readonly LeadStage[] = [
  LeadStage.NEW,
  LeadStage.CONTACTED,
  LeadStage.ENGAGED,
  LeadStage.MQL,
  LeadStage.SQL,
  LeadStage.DISCOVERY,
  LeadStage.DEMO_SCHEDULED,
  LeadStage.DEMO_COMPLETED,
  LeadStage.PROPOSAL_SENT,
  LeadStage.NEGOTIATION,
  LeadStage.VERBAL_COMMIT,
  LeadStage.CONTRACT_SENT,
  LeadStage.CONTRACT_SIGNED,
] as const;

export const TERMINAL_LEAD_STAGES: readonly LeadStage[] = [
  LeadStage.WON,
  LeadStage.LOST,
  LeadStage.DISQUALIFIED,
] as const;

export const ACTIVE_LEAD_STAGES: readonly LeadStage[] = LEAD_STAGE_ORDER;

export const HOLDING_LEAD_STAGES: readonly LeadStage[] = [
  LeadStage.ON_HOLD,
  LeadStage.NURTURE,
  LeadStage.COLD,
] as const;

/**
 * Display metadata per stage — drives pipeline UI rendering.
 * Colors match Situs dashboard aesthetic: emerald=positive, amber=watch,
 * rose=critical, slate=neutral.
 */
export const LEAD_STAGE_META: Record<LeadStage, {
  label:        string;
  shortLabel:   string;
  color:        string;
  group:        LeadStageGroup;
  description:  string;
  isTerminal:   boolean;
  isWon:        boolean;
  isLost:       boolean;
  /** Default forecast probability for this stage (0-1) — overridable per org */
  defaultWinProbability: number;
}> = {
  [LeadStage.NEW]: {
    label: "New",  shortLabel: "New",  color: "#64748B",  group: LEAD_STAGE_GROUP.TOP_OF_FUNNEL,
    description: "Lead just entered the system",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.02,
  },
  [LeadStage.CONTACTED]: {
    label: "Contacted",  shortLabel: "Contacted",  color: "#8B5CF6",  group: LEAD_STAGE_GROUP.TOP_OF_FUNNEL,
    description: "First outreach attempted",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.05,
  },
  [LeadStage.ENGAGED]: {
    label: "Engaged",  shortLabel: "Engaged",  color: "#06B6D4",  group: LEAD_STAGE_GROUP.TOP_OF_FUNNEL,
    description: "Lead responded or showed interest",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.10,
  },
  [LeadStage.MQL]: {
    label: "Marketing Qualified",  shortLabel: "MQL",  color: "#0EA5E9",  group: LEAD_STAGE_GROUP.QUALIFICATION,
    description: "Fits ideal customer profile",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.15,
  },
  [LeadStage.SQL]: {
    label: "Sales Qualified",  shortLabel: "SQL",  color: "#3B82F6",  group: LEAD_STAGE_GROUP.QUALIFICATION,
    description: "Verified intent and budget",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.25,
  },
  [LeadStage.DISQUALIFIED]: {
    label: "Disqualified",  shortLabel: "DQ",  color: "#94A3B8",  group: LEAD_STAGE_GROUP.QUALIFICATION,
    description: "Failed qualification criteria",
    isTerminal: true,  isWon: false,  isLost: true,  defaultWinProbability: 0,
  },
  [LeadStage.DISCOVERY]: {
    label: "Discovery",  shortLabel: "Discovery",  color: "#A855F7",  group: LEAD_STAGE_GROUP.OPPORTUNITY,
    description: "Needs assessment in progress",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.35,
  },
  [LeadStage.DEMO_SCHEDULED]: {
    label: "Demo Scheduled",  shortLabel: "Demo Set",  color: "#D946EF",  group: LEAD_STAGE_GROUP.OPPORTUNITY,
    description: "Product demo or visit booked",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.40,
  },
  [LeadStage.DEMO_COMPLETED]: {
    label: "Demo Completed",  shortLabel: "Demo Done",  color: "#F59E0B",  group: LEAD_STAGE_GROUP.OPPORTUNITY,
    description: "Demo done, evaluating next step",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.50,
  },
  [LeadStage.PROPOSAL_SENT]: {
    label: "Proposal Sent",  shortLabel: "Proposal",  color: "#EAB308",  group: LEAD_STAGE_GROUP.OPPORTUNITY,
    description: "Quote / SOW / proposal delivered",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.60,
  },
  [LeadStage.NEGOTIATION]: {
    label: "Negotiation",  shortLabel: "Negotiating",  color: "#F97316",  group: LEAD_STAGE_GROUP.LATE_STAGE,
    description: "Active price and terms discussion",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.70,
  },
  [LeadStage.VERBAL_COMMIT]: {
    label: "Verbal Commit",  shortLabel: "Verbal",  color: "#22C55E",  group: LEAD_STAGE_GROUP.LATE_STAGE,
    description: "Customer verbally committed",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.85,
  },
  [LeadStage.CONTRACT_SENT]: {
    label: "Contract Sent",  shortLabel: "Contract Out",  color: "#10B981",  group: LEAD_STAGE_GROUP.LATE_STAGE,
    description: "Agreement sent for signature",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.90,
  },
  [LeadStage.CONTRACT_SIGNED]: {
    label: "Contract Signed",  shortLabel: "Signed",  color: "#059669",  group: LEAD_STAGE_GROUP.LATE_STAGE,
    description: "Signed, awaiting payment/onboarding",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.95,
  },
  [LeadStage.WON]: {
    label: "Closed Won",  shortLabel: "Won",  color: "#10B981",  group: LEAD_STAGE_GROUP.TERMINAL,
    description: "Deal closed, revenue recognized",
    isTerminal: true,  isWon: true,  isLost: false,  defaultWinProbability: 1.0,
  },
  [LeadStage.LOST]: {
    label: "Closed Lost",  shortLabel: "Lost",  color: "#EF4444",  group: LEAD_STAGE_GROUP.TERMINAL,
    description: "Deal lost",
    isTerminal: true,  isWon: false,  isLost: true,  defaultWinProbability: 0,
  },
  [LeadStage.ON_HOLD]: {
    label: "On Hold",  shortLabel: "Hold",  color: "#F59E0B",  group: LEAD_STAGE_GROUP.HOLDING,
    description: "Paused by customer — revisit later",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.20,
  },
  [LeadStage.NURTURE]: {
    label: "Nurture",  shortLabel: "Nurture",  color: "#06B6D4",  group: LEAD_STAGE_GROUP.HOLDING,
    description: "Long-term nurture — not now",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.10,
  },
  [LeadStage.COLD]: {
    label: "Cold",  shortLabel: "Cold",  color: "#6B7280",  group: LEAD_STAGE_GROUP.HOLDING,
    description: "Unresponsive — needs re-engagement",
    isTerminal: false,  isWon: false,  isLost: false,  defaultWinProbability: 0.05,
  },
};

// ============================================================
// LEAD SOURCES — universal acquisition channels
// ============================================================

export const LeadSource = {
  // -- INBOUND DIGITAL --
  WEBSITE:           "WEBSITE",
  WEBSITE_FORM:      "WEBSITE_FORM",
  WEBSITE_CHAT:      "WEBSITE_CHAT",
  ORGANIC_SEARCH:    "ORGANIC_SEARCH",
  CONTENT_DOWNLOAD:  "CONTENT_DOWNLOAD",
  WEBINAR:           "WEBINAR",
  PODCAST:           "PODCAST",

  // -- PAID DIGITAL --
  GOOGLE_ADS:        "GOOGLE_ADS",
  LINKEDIN_ADS:      "LINKEDIN_ADS",
  FACEBOOK_ADS:      "FACEBOOK_ADS",
  INSTAGRAM_ADS:     "INSTAGRAM_ADS",
  YOUTUBE_ADS:       "YOUTUBE_ADS",
  TWITTER_ADS:       "TWITTER_ADS",
  DISPLAY_ADS:       "DISPLAY_ADS",
  RETARGETING:       "RETARGETING",

  // -- SOCIAL ORGANIC --
  LINKEDIN_ORGANIC:  "LINKEDIN_ORGANIC",
  TWITTER_ORGANIC:   "TWITTER_ORGANIC",
  FACEBOOK_ORGANIC:  "FACEBOOK_ORGANIC",
  INSTAGRAM_ORGANIC: "INSTAGRAM_ORGANIC",

  // -- OUTBOUND --
  COLD_EMAIL:        "COLD_EMAIL",
  COLD_CALL:         "COLD_CALL",
  COLD_LINKEDIN:     "COLD_LINKEDIN",
  SDR_OUTBOUND:      "SDR_OUTBOUND",

  // -- REFERRAL & WORD OF MOUTH --
  CUSTOMER_REFERRAL: "CUSTOMER_REFERRAL",
  EMPLOYEE_REFERRAL: "EMPLOYEE_REFERRAL",
  PARTNER_REFERRAL:  "PARTNER_REFERRAL",
  WORD_OF_MOUTH:     "WORD_OF_MOUTH",

  // -- PARTNERSHIPS --
  CHANNEL_PARTNER:   "CHANNEL_PARTNER",
  RESELLER:          "RESELLER",
  AFFILIATE:         "AFFILIATE",
  INTEGRATION:       "INTEGRATION",
  MARKETPLACE:       "MARKETPLACE",

  // -- EVENTS & OFFLINE --
  TRADE_SHOW:        "TRADE_SHOW",
  CONFERENCE:        "CONFERENCE",
  EXHIBITION:        "EXHIBITION",
  EVENT:             "EVENT",
  MEETUP:            "MEETUP",
  ROADSHOW:          "ROADSHOW",
  WALKIN:            "WALKIN",
  PHONE_INBOUND:     "PHONE_INBOUND",

  // -- PR & EARNED --
  PR_MENTION:        "PR_MENTION",
  PRESS_RELEASE:     "PRESS_RELEASE",
  REVIEW_SITE:       "REVIEW_SITE",        // G2, Capterra, TrustRadius
  DIRECTORY:         "DIRECTORY",          // Industry directories

  // -- INDUSTRY-SPECIFIC PORTALS --
  // Real estate (India)
  MAGICBRICKS:       "MAGICBRICKS",
  HOUSING_COM:       "HOUSING_COM",
  NINETY_NINE_ACRES: "NINETY_NINE_ACRES",
  NO_BROKER:         "NO_BROKER",
  // B2B SaaS
  PRODUCT_HUNT:      "PRODUCT_HUNT",
  HACKER_NEWS:       "HACKER_NEWS",
  // Generic
  THIRD_PARTY:       "THIRD_PARTY",

  // -- MANUAL & IMPORTED --
  MANUAL_ENTRY:      "MANUAL_ENTRY",       // Rep typed it in
  CSV_IMPORT:        "CSV_IMPORT",
  CRM_MIGRATION:     "CRM_MIGRATION",      // Imported from HubSpot/Salesforce/etc.
  API:               "API",                // Created via API integration

  // -- CATCH-ALL --
  OTHER:             "OTHER",
  UNKNOWN:           "UNKNOWN",
} as const;

export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

// ============================================================
// SOURCE CATEGORIES — for attribution analytics
// ============================================================

export const LEAD_SOURCE_CATEGORY = {
  INBOUND_DIGITAL:  "INBOUND_DIGITAL",
  PAID_DIGITAL:     "PAID_DIGITAL",
  SOCIAL_ORGANIC:   "SOCIAL_ORGANIC",
  OUTBOUND:         "OUTBOUND",
  REFERRAL:         "REFERRAL",
  PARTNERSHIP:      "PARTNERSHIP",
  EVENT:            "EVENT",
  EARNED:           "EARNED",
  INDUSTRY_PORTAL:  "INDUSTRY_PORTAL",
  MANUAL:           "MANUAL",
  OTHER:            "OTHER",
} as const;

export type LeadSourceCategory = (typeof LEAD_SOURCE_CATEGORY)[keyof typeof LEAD_SOURCE_CATEGORY];

export const LEAD_SOURCE_TO_CATEGORY: Record<LeadSource, LeadSourceCategory> = {
  // Inbound digital
  [LeadSource.WEBSITE]:           LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,
  [LeadSource.WEBSITE_FORM]:      LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,
  [LeadSource.WEBSITE_CHAT]:      LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,
  [LeadSource.ORGANIC_SEARCH]:    LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,
  [LeadSource.CONTENT_DOWNLOAD]:  LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,
  [LeadSource.WEBINAR]:           LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,
  [LeadSource.PODCAST]:           LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,

  // Paid digital
  [LeadSource.GOOGLE_ADS]:        LEAD_SOURCE_CATEGORY.PAID_DIGITAL,
  [LeadSource.LINKEDIN_ADS]:      LEAD_SOURCE_CATEGORY.PAID_DIGITAL,
  [LeadSource.FACEBOOK_ADS]:      LEAD_SOURCE_CATEGORY.PAID_DIGITAL,
  [LeadSource.INSTAGRAM_ADS]:     LEAD_SOURCE_CATEGORY.PAID_DIGITAL,
  [LeadSource.YOUTUBE_ADS]:       LEAD_SOURCE_CATEGORY.PAID_DIGITAL,
  [LeadSource.TWITTER_ADS]:       LEAD_SOURCE_CATEGORY.PAID_DIGITAL,
  [LeadSource.DISPLAY_ADS]:       LEAD_SOURCE_CATEGORY.PAID_DIGITAL,
  [LeadSource.RETARGETING]:       LEAD_SOURCE_CATEGORY.PAID_DIGITAL,

  // Social organic
  [LeadSource.LINKEDIN_ORGANIC]:  LEAD_SOURCE_CATEGORY.SOCIAL_ORGANIC,
  [LeadSource.TWITTER_ORGANIC]:   LEAD_SOURCE_CATEGORY.SOCIAL_ORGANIC,
  [LeadSource.FACEBOOK_ORGANIC]:  LEAD_SOURCE_CATEGORY.SOCIAL_ORGANIC,
  [LeadSource.INSTAGRAM_ORGANIC]: LEAD_SOURCE_CATEGORY.SOCIAL_ORGANIC,

  // Outbound
  [LeadSource.COLD_EMAIL]:        LEAD_SOURCE_CATEGORY.OUTBOUND,
  [LeadSource.COLD_CALL]:         LEAD_SOURCE_CATEGORY.OUTBOUND,
  [LeadSource.COLD_LINKEDIN]:     LEAD_SOURCE_CATEGORY.OUTBOUND,
  [LeadSource.SDR_OUTBOUND]:      LEAD_SOURCE_CATEGORY.OUTBOUND,

  // Referral
  [LeadSource.CUSTOMER_REFERRAL]: LEAD_SOURCE_CATEGORY.REFERRAL,
  [LeadSource.EMPLOYEE_REFERRAL]: LEAD_SOURCE_CATEGORY.REFERRAL,
  [LeadSource.PARTNER_REFERRAL]:  LEAD_SOURCE_CATEGORY.REFERRAL,
  [LeadSource.WORD_OF_MOUTH]:     LEAD_SOURCE_CATEGORY.REFERRAL,

  // Partnership
  [LeadSource.CHANNEL_PARTNER]:   LEAD_SOURCE_CATEGORY.PARTNERSHIP,
  [LeadSource.RESELLER]:          LEAD_SOURCE_CATEGORY.PARTNERSHIP,
  [LeadSource.AFFILIATE]:         LEAD_SOURCE_CATEGORY.PARTNERSHIP,
  [LeadSource.INTEGRATION]:       LEAD_SOURCE_CATEGORY.PARTNERSHIP,
  [LeadSource.MARKETPLACE]:       LEAD_SOURCE_CATEGORY.PARTNERSHIP,

  // Event
  [LeadSource.TRADE_SHOW]:        LEAD_SOURCE_CATEGORY.EVENT,
  [LeadSource.CONFERENCE]:        LEAD_SOURCE_CATEGORY.EVENT,
  [LeadSource.EXHIBITION]:        LEAD_SOURCE_CATEGORY.EVENT,
  [LeadSource.EVENT]:             LEAD_SOURCE_CATEGORY.EVENT,
  [LeadSource.MEETUP]:            LEAD_SOURCE_CATEGORY.EVENT,
  [LeadSource.ROADSHOW]:          LEAD_SOURCE_CATEGORY.EVENT,
  [LeadSource.WALKIN]:            LEAD_SOURCE_CATEGORY.EVENT,
  [LeadSource.PHONE_INBOUND]:     LEAD_SOURCE_CATEGORY.INBOUND_DIGITAL,

  // Earned
  [LeadSource.PR_MENTION]:        LEAD_SOURCE_CATEGORY.EARNED,
  [LeadSource.PRESS_RELEASE]:     LEAD_SOURCE_CATEGORY.EARNED,
  [LeadSource.REVIEW_SITE]:       LEAD_SOURCE_CATEGORY.EARNED,
  [LeadSource.DIRECTORY]:         LEAD_SOURCE_CATEGORY.EARNED,

  // Industry portals
  [LeadSource.MAGICBRICKS]:       LEAD_SOURCE_CATEGORY.INDUSTRY_PORTAL,
  [LeadSource.HOUSING_COM]:       LEAD_SOURCE_CATEGORY.INDUSTRY_PORTAL,
  [LeadSource.NINETY_NINE_ACRES]: LEAD_SOURCE_CATEGORY.INDUSTRY_PORTAL,
  [LeadSource.NO_BROKER]:         LEAD_SOURCE_CATEGORY.INDUSTRY_PORTAL,
  [LeadSource.PRODUCT_HUNT]:      LEAD_SOURCE_CATEGORY.INDUSTRY_PORTAL,
  [LeadSource.HACKER_NEWS]:       LEAD_SOURCE_CATEGORY.INDUSTRY_PORTAL,
  [LeadSource.THIRD_PARTY]:       LEAD_SOURCE_CATEGORY.INDUSTRY_PORTAL,

  // Manual
  [LeadSource.MANUAL_ENTRY]:      LEAD_SOURCE_CATEGORY.MANUAL,
  [LeadSource.CSV_IMPORT]:        LEAD_SOURCE_CATEGORY.MANUAL,
  [LeadSource.CRM_MIGRATION]:     LEAD_SOURCE_CATEGORY.MANUAL,
  [LeadSource.API]:               LEAD_SOURCE_CATEGORY.MANUAL,

  // Other
  [LeadSource.OTHER]:             LEAD_SOURCE_CATEGORY.OTHER,
  [LeadSource.UNKNOWN]:           LEAD_SOURCE_CATEGORY.OTHER,
};

// ============================================================
// LEAD PRIORITY & TEMPERATURE
// ============================================================

export const LeadPriority = {
  LOW:    "LOW",
  MEDIUM: "MEDIUM",
  HIGH:   "HIGH",
  URGENT: "URGENT",
} as const;

export type LeadPriority = (typeof LeadPriority)[keyof typeof LeadPriority];

export const LEAD_PRIORITY_ORDER: readonly LeadPriority[] = [
  LeadPriority.LOW,
  LeadPriority.MEDIUM,
  LeadPriority.HIGH,
  LeadPriority.URGENT,
];

/**
 * Temperature — used by AI scoring and rep prioritization.
 * Independent from stage: a NEGOTIATION lead can be COLD if dormant.
 */
export const LeadTemperature = {
  HOT:    "HOT",     // High engagement, recent activity, high win probability
  WARM:   "WARM",    // Moderate engagement
  COOL:   "COOL",    // Low engagement, needs nurturing
  COLD:   "COLD",    // Dormant
} as const;

export type LeadTemperature = (typeof LeadTemperature)[keyof typeof LeadTemperature];

// ============================================================
// LOST REASONS — drives decision intelligence
// ============================================================

/**
 * Structured loss reasons. The decision engine uses these to identify
 * patterns ("we're losing 40% of deals to price in the under-$10K
 * segment — should we offer a cheaper tier?").
 *
 * Group ownership: prefixes indicate where in the funnel the loss
 * typically occurs — useful for assigning reasons to the right team.
 */
export const LeadLostReason = {
  // -- Budget / pricing --
  PRICE_TOO_HIGH:        "PRICE_TOO_HIGH",
  BUDGET_CUT:            "BUDGET_CUT",
  NO_BUDGET:             "NO_BUDGET",

  // -- Fit --
  WRONG_FIT:             "WRONG_FIT",
  WRONG_SIZE:            "WRONG_SIZE",       // Too small / too large for our ICP
  WRONG_INDUSTRY:        "WRONG_INDUSTRY",
  WRONG_GEOGRAPHY:       "WRONG_GEOGRAPHY",
  WRONG_USE_CASE:        "WRONG_USE_CASE",

  // -- Product / features --
  MISSING_FEATURE:       "MISSING_FEATURE",
  INTEGRATION_GAP:       "INTEGRATION_GAP",
  COMPLIANCE_GAP:        "COMPLIANCE_GAP",    // SOC2, HIPAA, GDPR
  SECURITY_CONCERN:      "SECURITY_CONCERN",

  // -- Competition --
  LOST_TO_COMPETITOR:    "LOST_TO_COMPETITOR",
  CHOSE_BUILD_IN_HOUSE:  "CHOSE_BUILD_IN_HOUSE",
  CHOSE_STATUS_QUO:      "CHOSE_STATUS_QUO",  // Decided to do nothing

  // -- Timing --
  TIMING_NOT_RIGHT:      "TIMING_NOT_RIGHT",
  PROJECT_DELAYED:       "PROJECT_DELAYED",
  PROJECT_CANCELED:      "PROJECT_CANCELED",

  // -- Process / engagement --
  NO_DECISION_MAKER:     "NO_DECISION_MAKER",
  CHAMPION_LEFT:         "CHAMPION_LEFT",     // Internal advocate left the company
  COMPANY_ACQUIRED:      "COMPANY_ACQUIRED",
  COMPANY_SHUT_DOWN:     "COMPANY_SHUT_DOWN",

  // -- Quality issues --
  NO_RESPONSE:           "NO_RESPONSE",
  GHOSTED:               "GHOSTED",           // Stopped responding mid-deal
  UNQUALIFIED:           "UNQUALIFIED",       // Shouldn't have been pursued
  DUPLICATE:             "DUPLICATE",
  SPAM_OR_FAKE:          "SPAM_OR_FAKE",

  // -- Industry-specific --
  FINANCING_FELL_THROUGH: "FINANCING_FELL_THROUGH",  // Real estate, large deals
  LEGAL_REJECTED:        "LEGAL_REJECTED",   // Procurement / legal blocked
  PROCUREMENT_BLOCKED:   "PROCUREMENT_BLOCKED",

  // -- Catch-all --
  OTHER:                 "OTHER",
} as const;

export type LeadLostReason = (typeof LeadLostReason)[keyof typeof LeadLostReason];

export const LEAD_LOST_REASON_CATEGORY = {
  BUDGET:       "BUDGET",
  FIT:          "FIT",
  PRODUCT:      "PRODUCT",
  COMPETITION:  "COMPETITION",
  TIMING:       "TIMING",
  PROCESS:      "PROCESS",
  QUALITY:      "QUALITY",
  EXTERNAL:     "EXTERNAL",
  OTHER:        "OTHER",
} as const;

export type LeadLostReasonCategory =
  (typeof LEAD_LOST_REASON_CATEGORY)[keyof typeof LEAD_LOST_REASON_CATEGORY];

export const LEAD_LOST_REASON_TO_CATEGORY: Record<LeadLostReason, LeadLostReasonCategory> = {
  [LeadLostReason.PRICE_TOO_HIGH]:         LEAD_LOST_REASON_CATEGORY.BUDGET,
  [LeadLostReason.BUDGET_CUT]:             LEAD_LOST_REASON_CATEGORY.BUDGET,
  [LeadLostReason.NO_BUDGET]:              LEAD_LOST_REASON_CATEGORY.BUDGET,

  [LeadLostReason.WRONG_FIT]:              LEAD_LOST_REASON_CATEGORY.FIT,
  [LeadLostReason.WRONG_SIZE]:             LEAD_LOST_REASON_CATEGORY.FIT,
  [LeadLostReason.WRONG_INDUSTRY]:         LEAD_LOST_REASON_CATEGORY.FIT,
  [LeadLostReason.WRONG_GEOGRAPHY]:        LEAD_LOST_REASON_CATEGORY.FIT,
  [LeadLostReason.WRONG_USE_CASE]:         LEAD_LOST_REASON_CATEGORY.FIT,

  [LeadLostReason.MISSING_FEATURE]:        LEAD_LOST_REASON_CATEGORY.PRODUCT,
  [LeadLostReason.INTEGRATION_GAP]:        LEAD_LOST_REASON_CATEGORY.PRODUCT,
  [LeadLostReason.COMPLIANCE_GAP]:         LEAD_LOST_REASON_CATEGORY.PRODUCT,
  [LeadLostReason.SECURITY_CONCERN]:       LEAD_LOST_REASON_CATEGORY.PRODUCT,

  [LeadLostReason.LOST_TO_COMPETITOR]:     LEAD_LOST_REASON_CATEGORY.COMPETITION,
  [LeadLostReason.CHOSE_BUILD_IN_HOUSE]:   LEAD_LOST_REASON_CATEGORY.COMPETITION,
  [LeadLostReason.CHOSE_STATUS_QUO]:       LEAD_LOST_REASON_CATEGORY.COMPETITION,

  [LeadLostReason.TIMING_NOT_RIGHT]:       LEAD_LOST_REASON_CATEGORY.TIMING,
  [LeadLostReason.PROJECT_DELAYED]:        LEAD_LOST_REASON_CATEGORY.TIMING,
  [LeadLostReason.PROJECT_CANCELED]:       LEAD_LOST_REASON_CATEGORY.TIMING,

  [LeadLostReason.NO_DECISION_MAKER]:      LEAD_LOST_REASON_CATEGORY.PROCESS,
  [LeadLostReason.CHAMPION_LEFT]:          LEAD_LOST_REASON_CATEGORY.PROCESS,
  [LeadLostReason.COMPANY_ACQUIRED]:       LEAD_LOST_REASON_CATEGORY.EXTERNAL,
  [LeadLostReason.COMPANY_SHUT_DOWN]:      LEAD_LOST_REASON_CATEGORY.EXTERNAL,

  [LeadLostReason.NO_RESPONSE]:            LEAD_LOST_REASON_CATEGORY.QUALITY,
  [LeadLostReason.GHOSTED]:                LEAD_LOST_REASON_CATEGORY.QUALITY,
  [LeadLostReason.UNQUALIFIED]:            LEAD_LOST_REASON_CATEGORY.QUALITY,
  [LeadLostReason.DUPLICATE]:              LEAD_LOST_REASON_CATEGORY.QUALITY,
  [LeadLostReason.SPAM_OR_FAKE]:           LEAD_LOST_REASON_CATEGORY.QUALITY,

  [LeadLostReason.FINANCING_FELL_THROUGH]: LEAD_LOST_REASON_CATEGORY.EXTERNAL,
  [LeadLostReason.LEGAL_REJECTED]:         LEAD_LOST_REASON_CATEGORY.PROCESS,
  [LeadLostReason.PROCUREMENT_BLOCKED]:    LEAD_LOST_REASON_CATEGORY.PROCESS,

  [LeadLostReason.OTHER]:                  LEAD_LOST_REASON_CATEGORY.OTHER,
};

// ============================================================
// CRM SYSTEM IDENTIFIERS — for source-of-truth tracking
// ============================================================

/**
 * Which external CRM system this lead originated from. Critical for
 * the Revenue OS ingestion layer to track provenance and sync status.
 */
export const CrmSystem = {
  HUBSPOT:    "HUBSPOT",
  SALESFORCE: "SALESFORCE",
  PIPEDRIVE:  "PIPEDRIVE",
  ZOHO:       "ZOHO",
  FRESHSALES: "FRESHSALES",
  CLOSE:      "CLOSE",
  COPPER:     "COPPER",
  NATIVE:     "NATIVE",       // Created directly in Situs
  OTHER:      "OTHER",
} as const;

export type CrmSystem = (typeof CrmSystem)[keyof typeof CrmSystem];

// ============================================================
// VALIDATION & NORMALIZATION
// ============================================================

export function isValidLeadStage(value: unknown): value is LeadStage {
  if (typeof value !== "string") return false;
  return (Object.values(LeadStage) as string[]).includes(value);
}

export function isValidLeadSource(value: unknown): value is LeadSource {
  if (typeof value !== "string") return false;
  return (Object.values(LeadSource) as string[]).includes(value);
}

export function isValidLeadPriority(value: unknown): value is LeadPriority {
  if (typeof value !== "string") return false;
  return (Object.values(LeadPriority) as string[]).includes(value);
}

export function isValidLeadTemperature(value: unknown): value is LeadTemperature {
  if (typeof value !== "string") return false;
  return (Object.values(LeadTemperature) as string[]).includes(value);
}

export function isValidLeadLostReason(value: unknown): value is LeadLostReason {
  if (typeof value !== "string") return false;
  return (Object.values(LeadLostReason) as string[]).includes(value);
}

export function isValidCrmSystem(value: unknown): value is CrmSystem {
  if (typeof value !== "string") return false;
  return (Object.values(CrmSystem) as string[]).includes(value);
}

/**
 * Normalize an external string to a LeadStage. Critical for CRM ingestion
 * since HubSpot/Salesforce/Pipedrive all use different stage names.
 *
 * Aliases derived from real-world CRM exports.
 */
export function normalizeLeadStage(value: unknown): LeadStage | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toUpperCase().replace(/[-\s.]+/g, "_");

  if ((Object.values(LeadStage) as string[]).includes(cleaned)) {
    return cleaned as LeadStage;
  }

  const aliases: Record<string, LeadStage> = {
    // Common synonyms
    "NEW_LEAD":              LeadStage.NEW,
    "FRESH":                 LeadStage.NEW,
    "OPEN":                  LeadStage.NEW,
    "OPEN_DEAL":             LeadStage.NEW,
    "CALLED":                LeadStage.CONTACTED,
    "REACHED_OUT":           LeadStage.CONTACTED,
    "ATTEMPTED_CONTACT":     LeadStage.CONTACTED,
    "RESPONDED":             LeadStage.ENGAGED,
    "REPLIED":               LeadStage.ENGAGED,

    // HubSpot stages
    "SUBSCRIBER":            LeadStage.NEW,
    "LEAD":                  LeadStage.CONTACTED,
    "MARKETING_QUALIFIED_LEAD":   LeadStage.MQL,
    "SALES_QUALIFIED_LEAD":  LeadStage.SQL,
    "OPPORTUNITY":           LeadStage.SQL,
    "CUSTOMER":              LeadStage.WON,
    "EVANGELIST":            LeadStage.WON,

    // Salesforce stages
    "PROSPECTING":           LeadStage.CONTACTED,
    "QUALIFICATION":         LeadStage.MQL,
    "NEEDS_ANALYSIS":        LeadStage.DISCOVERY,
    "VALUE_PROPOSITION":     LeadStage.DISCOVERY,
    "ID_DECISION_MAKERS":    LeadStage.DISCOVERY,
    "PERCEPTION_ANALYSIS":   LeadStage.DEMO_COMPLETED,
    "PROPOSAL_PRICE_QUOTE":  LeadStage.PROPOSAL_SENT,
    "PROPOSAL":              LeadStage.PROPOSAL_SENT,
    "NEGOTIATION_REVIEW":    LeadStage.NEGOTIATION,
    "CLOSED_WON":            LeadStage.WON,
    "CLOSED_LOST":           LeadStage.LOST,

    // Pipedrive stages
    "QUALIFIED":             LeadStage.SQL,
    "CONTACT_MADE":          LeadStage.CONTACTED,
    "DEMO_SCHEDULED":        LeadStage.DEMO_SCHEDULED,
    "PROPOSAL_MADE":         LeadStage.PROPOSAL_SENT,
    "NEGOTIATIONS_STARTED":  LeadStage.NEGOTIATION,

    // Casual / informal
    "DEMO":                  LeadStage.DEMO_SCHEDULED,
    "PRESENTATION":          LeadStage.DEMO_COMPLETED,
    "PITCH":                 LeadStage.DEMO_COMPLETED,
    "QUOTE_SENT":            LeadStage.PROPOSAL_SENT,
    "QUOTED":                LeadStage.PROPOSAL_SENT,
    "PRICING":               LeadStage.NEGOTIATION,
    "VERBAL":                LeadStage.VERBAL_COMMIT,
    "AGREED":                LeadStage.VERBAL_COMMIT,
    "SIGNED":                LeadStage.CONTRACT_SIGNED,
    "WON":                   LeadStage.WON,
    "DEAL_WON":              LeadStage.WON,
    "LOST":                  LeadStage.LOST,
    "DEAL_LOST":             LeadStage.LOST,
    "DEAD":                  LeadStage.LOST,
    "DROPPED":               LeadStage.LOST,
    "PAUSED":                LeadStage.ON_HOLD,
    "WAITING":               LeadStage.ON_HOLD,
    "FUTURE":                LeadStage.NURTURE,
    "LONG_TERM":             LeadStage.NURTURE,
    "DORMANT":               LeadStage.COLD,

    // Real-estate carryovers (preserved from prior version)
    "SITE_VISIT":            LeadStage.DEMO_SCHEDULED,
    "VISITED":               LeadStage.DEMO_COMPLETED,
    "WALKTHROUGH":           LeadStage.DEMO_COMPLETED,
    "BOOKED":                LeadStage.VERBAL_COMMIT,
    "CLOSED":                LeadStage.WON,
  };

  return aliases[cleaned] ?? null;
}

/**
 * Normalize an external source string. Aliases cover variations seen
 * across HubSpot, Salesforce, Pipedrive, Zoho, and free-text imports.
 */
export function normalizeLeadSource(value: unknown): LeadSource | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toUpperCase().replace(/[-\s.]+/g, "_");

  if ((Object.values(LeadSource) as string[]).includes(cleaned)) {
    return cleaned as LeadSource;
  }

  const aliases: Record<string, LeadSource> = {
    // Paid digital
    "FB":              LeadSource.FACEBOOK_ADS,
    "FACEBOOK":        LeadSource.FACEBOOK_ADS,
    "META":            LeadSource.FACEBOOK_ADS,
    "IG":              LeadSource.INSTAGRAM_ADS,
    "INSTAGRAM":       LeadSource.INSTAGRAM_ADS,
    "GOOGLE":          LeadSource.GOOGLE_ADS,
    "ADWORDS":         LeadSource.GOOGLE_ADS,
    "GADS":            LeadSource.GOOGLE_ADS,
    "PPC":             LeadSource.GOOGLE_ADS,
    "PAID_SEARCH":     LeadSource.GOOGLE_ADS,
    "LI_ADS":          LeadSource.LINKEDIN_ADS,
    "LINKEDIN":        LeadSource.LINKEDIN_ORGANIC,
    "YT":              LeadSource.YOUTUBE_ADS,
    "YOUTUBE":         LeadSource.YOUTUBE_ADS,
    "TWITTER":         LeadSource.TWITTER_ORGANIC,
    "X":               LeadSource.TWITTER_ORGANIC,

    // Inbound
    "WEB":             LeadSource.WEBSITE,
    "SITE":            LeadSource.WEBSITE,
    "WEB_FORM":        LeadSource.WEBSITE_FORM,
    "CONTACT_FORM":    LeadSource.WEBSITE_FORM,
    "FORM_FILL":       LeadSource.WEBSITE_FORM,
    "CHAT":            LeadSource.WEBSITE_CHAT,
    "LIVECHAT":        LeadSource.WEBSITE_CHAT,
    "INTERCOM":        LeadSource.WEBSITE_CHAT,
    "ORGANIC":         LeadSource.ORGANIC_SEARCH,
    "SEO":             LeadSource.ORGANIC_SEARCH,
    "SEARCH":          LeadSource.ORGANIC_SEARCH,
    "EBOOK":           LeadSource.CONTENT_DOWNLOAD,
    "WHITEPAPER":      LeadSource.CONTENT_DOWNLOAD,
    "GATED_CONTENT":   LeadSource.CONTENT_DOWNLOAD,

    // Outbound
    "EMAIL":           LeadSource.COLD_EMAIL,
    "OUTBOUND_EMAIL":  LeadSource.COLD_EMAIL,
    "CALL":            LeadSource.COLD_CALL,
    "TELE":            LeadSource.COLD_CALL,
    "OUTBOUND_CALL":   LeadSource.COLD_CALL,
    "PHONE":           LeadSource.PHONE_INBOUND,
    "INBOUND_CALL":    LeadSource.PHONE_INBOUND,
    "SDR":             LeadSource.SDR_OUTBOUND,
    "BDR":             LeadSource.SDR_OUTBOUND,

    // Referral
    "REFERRAL":        LeadSource.CUSTOMER_REFERRAL,
    "REFER":           LeadSource.CUSTOMER_REFERRAL,
    "REFERRED":        LeadSource.CUSTOMER_REFERRAL,
    "WOM":             LeadSource.WORD_OF_MOUTH,

    // Events
    "EVENT":           LeadSource.EVENT,
    "TRADESHOW":       LeadSource.TRADE_SHOW,
    "CONFERENCE":      LeadSource.CONFERENCE,
    "EXPO":            LeadSource.EXHIBITION,
    "WEBINAR":         LeadSource.WEBINAR,

    // Reviews
    "G2":              LeadSource.REVIEW_SITE,
    "CAPTERRA":        LeadSource.REVIEW_SITE,
    "TRUSTPILOT":      LeadSource.REVIEW_SITE,
    "TRUSTRADIUS":     LeadSource.REVIEW_SITE,

    // Real estate (preserved)
    "MAGIC_BRICKS":    LeadSource.MAGICBRICKS,
    "MB":              LeadSource.MAGICBRICKS,
    "99_ACRES":        LeadSource.NINETY_NINE_ACRES,
    "99ACRES":         LeadSource.NINETY_NINE_ACRES,
    "HOUSING":         LeadSource.HOUSING_COM,

    // Import / API
    "IMPORT":          LeadSource.CSV_IMPORT,
    "CSV":             LeadSource.CSV_IMPORT,
    "MIGRATION":       LeadSource.CRM_MIGRATION,
    "HUBSPOT":         LeadSource.CRM_MIGRATION,
    "SALESFORCE":      LeadSource.CRM_MIGRATION,
    "PIPEDRIVE":       LeadSource.CRM_MIGRATION,
    "ZOHO":            LeadSource.CRM_MIGRATION,

    // Catch-all
    "WALK_IN":         LeadSource.WALKIN,
    "WALK-IN":         LeadSource.WALKIN,
    "PARTNER":         LeadSource.CHANNEL_PARTNER,
    "CP":              LeadSource.CHANNEL_PARTNER,
  };

  return aliases[cleaned] ?? null;
}

// ============================================================
// STAGE TRANSITION & PROGRESSION
// ============================================================

/**
 * Validate a stage transition. Used by lead.controller.ts before
 * persisting stage changes.
 *
 * Rules:
 *   - Terminal stages (WON, LOST, DISQUALIFIED) are sticky — require
 *     explicit re-open to leave
 *   - Holding stages (ON_HOLD, NURTURE, COLD) can go anywhere
 *   - Forward and backward progression always allowed otherwise
 *     (reps legitimately move deals back to NEGOTIATION from VERBAL_COMMIT)
 */
export function canTransitionLeadStage(
  from: LeadStage,
  to:   LeadStage
): { allowed: boolean; reason?: string } {
  if (from === to) return { allowed: true };

  if ((TERMINAL_LEAD_STAGES as readonly string[]).includes(from)) {
    return {
      allowed: false,
      reason:  "Cannot transition from terminal stage " + from + " — reopen the deal first",
    };
  }

  return { allowed: true };
}

/**
 * Funnel progress (0-1) — used for visualizations and forecast weighting.
 * LOST and DISQUALIFIED return 0; WON returns 1.
 */
export function getLeadProgress(stage: LeadStage): number {
  if (stage === LeadStage.WON) return 1;
  if (stage === LeadStage.LOST || stage === LeadStage.DISQUALIFIED) return 0;
  if ((HOLDING_LEAD_STAGES as readonly string[]).includes(stage)) return 0;

  const idx = LEAD_STAGE_ORDER.indexOf(stage);
  if (idx === -1) return 0;
  return idx / (LEAD_STAGE_ORDER.length - 1);
}

/**
 * Get the next stage in the funnel. Returns null for terminal/holding stages.
 */
export function getNextLeadStage(current: LeadStage): LeadStage | null {
  if ((TERMINAL_LEAD_STAGES as readonly string[]).includes(current)) return null;
  if ((HOLDING_LEAD_STAGES as readonly string[]).includes(current)) return null;

  const idx = LEAD_STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx >= LEAD_STAGE_ORDER.length - 1) return null;
  return LEAD_STAGE_ORDER[idx + 1] ?? null;
}

/**
 * Get default win probability for a stage. Decision engines start with
 * these baselines and override per-org based on historical close rates.
 */
export function getDefaultWinProbability(stage: LeadStage): number {
  return LEAD_STAGE_META[stage]?.defaultWinProbability ?? 0;
}

export function getLeadSourceCategory(source: LeadSource): LeadSourceCategory {
  return LEAD_SOURCE_TO_CATEGORY[source] ?? LEAD_SOURCE_CATEGORY.OTHER;
}

export function getLeadLostReasonCategory(reason: LeadLostReason): LeadLostReasonCategory {
  return LEAD_LOST_REASON_TO_CATEGORY[reason] ?? LEAD_LOST_REASON_CATEGORY.OTHER;
}

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

export const ALL_LEAD_STAGES        = Object.values(LeadStage);
export const ALL_LEAD_SOURCES       = Object.values(LeadSource);
export const ALL_LEAD_PRIORITIES    = Object.values(LeadPriority);
export const ALL_LEAD_TEMPERATURES  = Object.values(LeadTemperature);
export const ALL_LEAD_LOST_REASONS  = Object.values(LeadLostReason);
export const ALL_CRM_SYSTEMS        = Object.values(CrmSystem);