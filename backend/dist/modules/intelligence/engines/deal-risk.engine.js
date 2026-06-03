// deal-risk.engine.ts
//
// Pure heuristic scoring of a single deal's risk of slipping or being lost.
// Deterministic — same input always produces same output. No I/O, no DB,
// no LLM. Safe to call from any context (request handler, scheduled job,
// frontend preview).
//
// Design:
//   - Pure function: takes a normalized DealSignals input, returns a result
//   - Factor-based scoring: each factor contributes a documented weight
//     so the result is fully explainable
//   - Versioned: results carry engineVersion so DB-stored scores can be
//     migrated when thresholds change
//   - Configurable thresholds: live as constants here, easy to tune
//   - Backend-friendly: accepts the full Deal document, extracts what
//     it needs (no hardcoded "lastActivityDays: 3" placeholder)
//   - Frontend-compatible: also exports a thin calculateDealRisk wrapper
//     matching the original frontend signature so old call sites keep working
//
// Used by:
//   - Scoring service (orchestrator/scoring.service.ts) — runs nightly
//     against every deal, writes results back to Deal.riskScore etc.
//   - Decision recommendations — feeds into "shoot your shot today" logic
//   - Analytics service — populates "at risk" metrics on the dashboard
//   - Alert generation — triggers when score crosses thresholds
// ============================================================
// VERSIONING
// ============================================================
/**
 * Engine version. Bump when:
 *   - Threshold values change materially
 *   - New risk factors added that affect score ranges
 *   - Scoring formula changes
 *
 * Stored alongside results so historical comparisons are valid.
 * Migration: when bumping, schedule a re-scoring job to update
 * existing Deal.riskScore values to the new version.
 */
export const DEAL_RISK_ENGINE_VERSION = "1.0.0";
// ============================================================
// CONFIG — thresholds and weights
// All scoring weights centralized here. Tuning happens by editing
// these values and bumping DEAL_RISK_ENGINE_VERSION.
// ============================================================
const RISK_CONFIG = {
    /** Activity recency thresholds in days */
    activity: {
        severeDays: 15, // no contact in this many days → severe penalty
        severeWeight: 40,
        warnDays: 8,
        warnWeight: 25,
        lowDays: 4,
        lowWeight: 10,
    },
    /** Per-stage time-in-stage thresholds */
    stageStall: {
        negotiationDaysMax: 14,
        negotiationWeight: 20,
        proposalDaysMax: 10,
        proposalWeight: 15,
        qualificationDaysMax: 21,
        qualificationWeight: 10,
        discoveryDaysMax: 14,
        discoveryWeight: 8,
    },
    /** Overall deal age cap */
    age: {
        overdueDays: 45,
        overdueWeight: 15,
        severeOverdueDays: 90,
        severeOverdueWeight: 25,
    },
    /** Probability + age combination — high prob deals shouldn't be old */
    staleHighProbability: {
        probabilityMin: 60, // deals expected to close...
        ageDaysMin: 30, // ...but stuck for 30+ days
        weight: 12,
    },
    /** Value-vs-momentum: high-value deals with falling momentum are worse */
    highValueFalling: {
        valueMin: 500_000, // ₹5 Lakh+
        lastActivityDaysMin: 7,
        weight: 10,
    },
    /** Min score for each risk level */
    levels: {
        critical: 80,
        high: 60,
        medium: 30,
        // Below 30 = low
    },
};
/**
 * Canonical stage names. Matches your lead.enums.ts vocabulary.
 * Engine accepts any string but knows about these specifically.
 */
export const RISK_KNOWN_STAGES = {
    DISCOVERY: "DISCOVERY",
    QUALIFICATION: "QUALIFICATION",
    PROPOSAL_SENT: "PROPOSAL_SENT",
    NEGOTIATION: "NEGOTIATION",
    VERBAL_COMMIT: "VERBAL_COMMIT",
    CONTRACT_SENT: "CONTRACT_SENT",
};
// ============================================================
// CORE ENGINE
// ============================================================
/**
 * Score a single deal. Pure function — no side effects.
 *
 * Returns a result with score capped at 100.
 * Closed deals (won/lost/etc.) always score 0 — they're no longer at risk.
 */
export function scoreDealRisk(signals) {
    const computedAt = new Date();
    const factors = [];
    // Closed deals can't be at risk by definition
    if (signals.status === "won" ||
        signals.status === "lost" ||
        signals.status === "abandoned") {
        return {
            ...(signals.dealId !== undefined && { dealId: signals.dealId }),
            name: signals.name,
            riskScore: 0,
            riskLevel: "low",
            factors: [],
            reasons: [],
            engineVersion: DEAL_RISK_ENGINE_VERSION,
            computedAt,
        };
    }
    // -----------------------------------------------------------
    // FACTOR 1: Activity recency
    // -----------------------------------------------------------
    const a = signals.lastActivityDays;
    if (a >= RISK_CONFIG.activity.severeDays) {
        factors.push({
            code: "ACTIVITY_SEVERE",
            message: "No activity for " + RISK_CONFIG.activity.severeDays + "+ days",
            weight: RISK_CONFIG.activity.severeWeight,
        });
    }
    else if (a >= RISK_CONFIG.activity.warnDays) {
        factors.push({
            code: "ACTIVITY_WARN",
            message: "No activity for " + RISK_CONFIG.activity.warnDays + "+ days",
            weight: RISK_CONFIG.activity.warnWeight,
        });
    }
    else if (a >= RISK_CONFIG.activity.lowDays) {
        factors.push({
            code: "ACTIVITY_LOW",
            message: "Low activity in the last " + a + " days",
            weight: RISK_CONFIG.activity.lowWeight,
        });
    }
    // -----------------------------------------------------------
    // FACTOR 2: Stage stall — per-stage thresholds
    // -----------------------------------------------------------
    const stageNorm = normalizeStageName(signals.stage);
    const stageDays = signals.daysInCurrentStage ?? 0;
    if (stageNorm === RISK_KNOWN_STAGES.NEGOTIATION &&
        stageDays > RISK_CONFIG.stageStall.negotiationDaysMax) {
        factors.push({
            code: "STAGE_STALL_NEGOTIATION",
            message: "Negotiation has run " + stageDays + " days (typical max " +
                RISK_CONFIG.stageStall.negotiationDaysMax + ")",
            weight: RISK_CONFIG.stageStall.negotiationWeight,
        });
    }
    else if (stageNorm === RISK_KNOWN_STAGES.PROPOSAL_SENT &&
        stageDays > RISK_CONFIG.stageStall.proposalDaysMax) {
        factors.push({
            code: "STAGE_STALL_PROPOSAL",
            message: "Proposal pending response for " + stageDays + " days",
            weight: RISK_CONFIG.stageStall.proposalWeight,
        });
    }
    else if (stageNorm === RISK_KNOWN_STAGES.QUALIFICATION &&
        stageDays > RISK_CONFIG.stageStall.qualificationDaysMax) {
        factors.push({
            code: "STAGE_STALL_QUALIFICATION",
            message: "Stuck in qualification for " + stageDays + " days",
            weight: RISK_CONFIG.stageStall.qualificationWeight,
        });
    }
    else if (stageNorm === RISK_KNOWN_STAGES.DISCOVERY &&
        stageDays > RISK_CONFIG.stageStall.discoveryDaysMax) {
        factors.push({
            code: "STAGE_STALL_DISCOVERY",
            message: "Stuck in discovery for " + stageDays + " days",
            weight: RISK_CONFIG.stageStall.discoveryWeight,
        });
    }
    // -----------------------------------------------------------
    // FACTOR 3: Deal age — overall pipeline aging
    // -----------------------------------------------------------
    const age = signals.ageDays ?? 0;
    if (age > RISK_CONFIG.age.severeOverdueDays) {
        factors.push({
            code: "AGE_SEVERE",
            message: "Deal age " + age + " days far exceeds typical sales cycle",
            weight: RISK_CONFIG.age.severeOverdueWeight,
        });
    }
    else if (age > RISK_CONFIG.age.overdueDays) {
        factors.push({
            code: "AGE_OVERDUE",
            message: "Deal age " + age + " days exceeds typical sales cycle",
            weight: RISK_CONFIG.age.overdueWeight,
        });
    }
    // -----------------------------------------------------------
    // FACTOR 4: Stale high-probability deals
    // High-probability deals stuck for 30+ days are particularly risky —
    // the rep was confident, then something stopped it. Investigate.
    // -----------------------------------------------------------
    if (typeof signals.probability === "number" &&
        signals.probability >= RISK_CONFIG.staleHighProbability.probabilityMin &&
        age >= RISK_CONFIG.staleHighProbability.ageDaysMin) {
        factors.push({
            code: "STALE_HIGH_PROBABILITY",
            message: "High-probability deal (" + signals.probability + "%) stalled " +
                age + " days — was expected to close",
            weight: RISK_CONFIG.staleHighProbability.weight,
        });
    }
    // -----------------------------------------------------------
    // FACTOR 5: High-value falling momentum
    // Large deals losing momentum hurt the forecast disproportionately
    // -----------------------------------------------------------
    if (signals.value >= RISK_CONFIG.highValueFalling.valueMin &&
        a >= RISK_CONFIG.highValueFalling.lastActivityDaysMin) {
        factors.push({
            code: "HIGH_VALUE_FALLING",
            message: "High-value deal (" + formatINR(signals.value) +
                ") with falling momentum",
            weight: RISK_CONFIG.highValueFalling.weight,
        });
    }
    // -----------------------------------------------------------
    // TOTAL + CAP
    // -----------------------------------------------------------
    const rawScore = factors.reduce((sum, f) => sum + f.weight, 0);
    const riskScore = Math.min(100, Math.max(0, rawScore));
    // Sort factors by weight desc — biggest issues first
    factors.sort((a, b) => b.weight - a.weight);
    const result = {
        name: signals.name,
        riskScore,
        riskLevel: getRiskLevelFromScore(riskScore),
        factors,
        reasons: factors.map((f) => f.message),
        engineVersion: DEAL_RISK_ENGINE_VERSION,
        computedAt,
    };
    if (signals.dealId !== undefined) {
        result.dealId = signals.dealId;
    }
    return result;
}
// ============================================================
// HELPERS
// ============================================================
/**
 * Normalize incoming stage name to canonical form. Handles:
 *   - Case insensitivity ("Negotiation" → "NEGOTIATION")
 *   - Space-to-underscore ("Proposal Sent" → "PROPOSAL_SENT")
 *   - Common synonyms ("Proposal" → "PROPOSAL_SENT")
 *
 * Unknown stages pass through uppercase, just won't match per-stage rules.
 */
function normalizeStageName(stage) {
    if (!stage)
        return "";
    const upper = stage.trim().toUpperCase().replace(/\s+/g, "_");
    // Synonyms
    if (upper === "PROPOSAL")
        return RISK_KNOWN_STAGES.PROPOSAL_SENT;
    if (upper === "QUALIFYING")
        return RISK_KNOWN_STAGES.QUALIFICATION;
    if (upper === "QUALIFY")
        return RISK_KNOWN_STAGES.QUALIFICATION;
    if (upper === "DISCOVER")
        return RISK_KNOWN_STAGES.DISCOVERY;
    return upper;
}
/**
 * Derive categorical risk level from numeric score.
 * Matches your Deal model's riskLevel enum.
 */
export function getRiskLevelFromScore(score) {
    if (score >= RISK_CONFIG.levels.critical)
        return "critical";
    if (score >= RISK_CONFIG.levels.high)
        return "high";
    if (score >= RISK_CONFIG.levels.medium)
        return "medium";
    return "low";
}
/**
 * Compact INR formatter for human-readable factor messages.
 *   500000  → "₹5 Lakh"
 *   12000000 → "₹1.2 Cr"
 *   50000   → "₹50,000"
 */
function formatINR(rupees) {
    if (rupees >= 10_000_000) {
        return "\u20B9" + (rupees / 10_000_000).toFixed(1) + " Cr";
    }
    if (rupees >= 100_000) {
        return "\u20B9" + (rupees / 100_000).toFixed(1) + " Lakh";
    }
    return "\u20B9" + rupees.toLocaleString("en-IN");
}
// ============================================================
// BATCH SCORING
// ============================================================
/**
 * Score many deals at once, return ranked highest-risk first.
 * Used by the dashboard "Top Risk Deals" widget and the decision engine.
 */
export function rankDealsByRisk(deals) {
    return deals
        .map(scoreDealRisk)
        .sort((a, b) => b.riskScore - a.riskScore);
}
/**
 * Categorical momentum from activity recency alone.
 * For richer momentum analysis (stage transitions, velocity), see
 * deal-momentum.engine.ts which considers full stage history.
 */
export function getDealMomentum(signals) {
    const a = signals.lastActivityDays;
    if (a <= 2) {
        return {
            label: "improving",
            color: "green",
            arrow: "up",
            reason: "Recent activity within last 2 days",
        };
    }
    if (a <= 7) {
        return {
            label: "stable",
            color: "slate",
            arrow: "right",
            reason: "Activity within last week",
        };
    }
    return {
        label: "falling",
        color: "red",
        arrow: "down",
        reason: "No activity for " + a + " days",
    };
}
// ============================================================
// LEGACY-COMPATIBLE WRAPPER
// Keeps the original frontend signature working so existing call sites
// (situs-frontend/src/app/dashboard/deals/page.tsx) don't break.
// ============================================================
/**
 * @deprecated Prefer scoreDealRisk for new code — same logic, richer
 * result shape including factors, levels, and version.
 */
export function calculateDealRisk(deal) {
    const result = scoreDealRisk({
        name: deal.name,
        value: deal.value,
        stage: deal.stage,
        lastActivityDays: deal.lastActivityDays,
        ...(deal.stageDays !== undefined && { daysInCurrentStage: deal.stageDays }),
        ...(deal.ageDays !== undefined && { ageDays: deal.ageDays }),
    });
    return {
        name: result.name,
        riskScore: result.riskScore,
        reasons: result.reasons,
    };
}
/**
 * @deprecated Prefer getRiskLevelFromScore which returns the canonical
 * Deal model enum ("low" / "medium" / "high" / "critical").
 *
 * Kept for frontend backward-compat — same label semantics but matches
 * the Tailwind class hints expected by existing UI.
 */
export function getRiskLevel(score) {
    const level = getRiskLevelFromScore(score);
    if (level === "critical")
        return { label: "Critical", color: "text-red-600" };
    if (level === "high")
        return { label: "Watch", color: "text-orange-500" };
    if (level === "medium")
        return { label: "Watch", color: "text-orange-500" };
    return { label: "Healthy", color: "text-green-600" };
}
// ============================================================
// EXPORTS for the backend signal extractor (used by scoring service)
// ============================================================
/**
 * Extract DealRiskSignals from a Mongoose-shaped Deal document.
 * The scoring service uses this to bridge from the DB to the engine.
 *
 * NOTE: this function expects the stage NAME, not stageId. The caller
 * must resolve the stage via Pipeline lookup before calling.
 */
export function extractRiskSignals(input) {
    const lastActivityDays = input.lastActivityAt
        ? Math.max(0, Math.floor((Date.now() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
    const signals = {
        name: input.title ?? "Untitled Deal",
        value: input.value ?? 0,
        stage: input.stageName,
        lastActivityDays,
    };
    if (input._id !== undefined)
        signals.dealId = input._id;
    if (input.daysInCurrentStage !== undefined)
        signals.daysInCurrentStage = input.daysInCurrentStage;
    if (input.ageDays !== undefined)
        signals.ageDays = input.ageDays;
    if (input.probability !== undefined)
        signals.probability = input.probability;
    if (input.status !== undefined)
        signals.status = input.status;
    return signals;
}
export default scoreDealRisk;
//# sourceMappingURL=deal-risk.engine.js.map