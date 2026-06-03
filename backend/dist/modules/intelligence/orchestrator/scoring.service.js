// scoring.service.ts
//
// Bridges the pure deal-risk engine to the real Deal model.
// Fetches open deals, translates each into the engine's input shape,
// runs the risk calculation, and writes results back to Mongo.
//
// Called by scoring.scheduler.ts on a schedule, and can be called
// on-demand (e.g. after a deal update) from the intelligence controller.
import Deal from "../../deals/deal.model.js";
import { calculateDealRisk } from "../engines/deal-risk.engine.js";
import { dbLogger } from "../../../utils/logger.js";
/* =====================================================
   CONFIG
===================================================== */
const SCORING_CONFIG = {
    /* Max deals to score in one batch run — protects memory/time */
    batchSize: 500,
    /* ms in a day, for date → days conversion */
    msPerDay: 1000 * 60 * 60 * 24,
};
/* =====================================================
   HELPERS
===================================================== */
/** Convert a Date to whole days elapsed since then (>= 0). */
function daysSince(date) {
    if (!date)
        return 0;
    const diff = Date.now() - new Date(date).getTime();
    return Math.max(0, Math.floor(diff / SCORING_CONFIG.msPerDay));
}
/** Derive RiskLevel from numeric score (matches deal.model thresholds). */
function toRiskLevel(score) {
    if (score >= 80)
        return "critical";
    if (score >= 60)
        return "high";
    if (score >= 30)
        return "medium";
    return "low";
}
/**
 * Translate a Mongo Deal document into the pure engine's input shape.
 * The engine speaks a simplified vocabulary (name, lastActivityDays,
 * stageDays) — this adapter maps the DB fields onto it.
 */
function toEngineDeal(deal) {
    return {
        name: deal.title,
        value: deal.value,
        /* Stage-name rules (Negotiation/Proposal) are skipped in Option A;
           we pass an empty string so those branches simply don't fire. The
           activity- and age-based rules still apply fully. */
        stage: "",
        lastActivityDays: daysSince(deal.lastActivityAt),
        stageDays: deal.daysInCurrentStage ?? 0,
        ageDays: deal.ageDays ?? daysSince(deal.createdAt),
    };
}
/* =====================================================
   SERVICE
===================================================== */
class ScoringService {
    /**
     * Score a single deal document, write results back, and return the outcome.
     * Does NOT save unless persist is true (caller may batch saves).
     */
    async scoreDeal(deal, persist = true) {
        const engineInput = toEngineDeal(deal);
        const result = calculateDealRisk(engineInput);
        const riskLevel = toRiskLevel(result.riskScore);
        deal.riskScore = result.riskScore;
        deal.riskLevel = riskLevel;
        deal.riskFactors = result.reasons.map((reason) => ({
            factor: reason,
            weight: 0,
            detectedAt: new Date(),
            resolved: false,
        }));
        deal.riskCalculatedAt = new Date();
        if (persist) {
            await deal.save();
        }
        return {
            dealId: String(deal._id),
            title: deal.title,
            riskScore: result.riskScore,
            riskLevel,
            reasons: result.reasons,
        };
    }
    /**
     * Score all open, non-deleted deals for an organization.
     * Used by the scheduler (periodic) and the controller (on-demand).
     */
    async scoreOrganization(organizationId) {
        const startedAt = Date.now();
        const deals = await Deal.find({
            organizationId,
            isDeleted: false,
            status: "open",
        }).limit(SCORING_CONFIG.batchSize);
        const outcomes = [];
        let failed = 0;
        for (const deal of deals) {
            try {
                const outcome = await this.scoreDeal(deal, true);
                outcomes.push(outcome);
            }
            catch (err) {
                failed++;
                dbLogger.error("Scoring failed for deal=" + String(deal._id) +
                    " org=" + organizationId +
                    " err=" + (err?.message ?? "unknown"));
            }
        }
        const durationMs = Date.now() - startedAt;
        dbLogger.info("Scoring run complete: org=" + organizationId +
            " scored=" + outcomes.length +
            " failed=" + failed +
            " durationMs=" + durationMs);
        return {
            organizationId,
            scored: outcomes.length,
            failed,
            durationMs,
            outcomes,
        };
    }
}
export default new ScoringService();
//# sourceMappingURL=scoring.service.js.map