// intelligence.service.ts
//
// Orchestrator for the intelligence subsystem. Runs the 5 ported engines
// against a tenant's data, composes their outputs, writes scores back
// to Deal documents, emits alerts, and returns a unified result.
//
// Design:
//   - Multi-tenant scoped — every operation requires organizationId
//   - Stage resolution — converts Deal.stageId to canonical stage names
//     before passing to engines (engines accept names, not ObjectIds)
//   - Parallel engine execution via Promise.all — wall-clock latency
//     stays low even with 5 engines
//   - Idempotent — running the orchestrator twice on the same data
//     produces the same result and writes the same scores
//   - Bounded writes — uses bulkWrite for Deal updates instead of N
//     individual saves (1 round-trip instead of N)
//   - Soft-failure: if one engine throws, others still produce results;
//     errors logged but the request doesn't crash
//   - Engine versioning surfaced — every result carries which engine
//     versions produced it
//
// Used by:
//   - intelligence.controller.ts — on-demand "refresh intelligence" API
//   - intelligence.scheduler.ts — nightly BullMQ job for all orgs
import mongoose from "mongoose";
import Deal from "../deals/deal.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import Alert from "../alerts/alert.model.js";
import User from "../users/user.model.js";
import { dbLogger, jobLogger } from "../../utils/logger.js";
const engineLogger = jobLogger;
import { scoreDealRisk, extractRiskSignals, DEAL_RISK_ENGINE_VERSION, } from "./engines/deal-risk.engine.js";
import { detectDealAttention, extractAttentionSignals, DEALS_ATTENTION_ENGINE_VERSION, } from "./engines/deals-attention.engine.js";
import { detectForecastRisk, extractForecastSignals, FORECAST_RISK_ENGINE_VERSION, } from "./engines/forecast-risk.engine.js";
import { detectPipelineLeaks, extractPipelineLeakSignals, PIPELINE_LEAK_ENGINE_VERSION, } from "./engines/pipeline-leak-engine.js";
import { generateRevenueActions, assembleDecisionSignals, REVENUE_DECISION_ENGINE_VERSION, } from "./engines/revenue-decision-engine.js";
// ============================================================
// CONFIG
// ============================================================
const INTELLIGENCE_CONFIG = {
    /**
     * Max deals to process in a single orchestrator run. Large orgs
     * with 50k+ deals are processed in batches to avoid OOM.
     * If you exceed this, fall back to scheduled batch mode.
     */
    maxDealsPerRun: 10_000,
    /**
     * Engine versioning — surfaced in results so callers can detect
     * stale scores after threshold tuning.
     */
    orchestratorVersion: "1.0.0",
    /**
     * Whether to write scores back to Deal documents on every run.
     * False = read-only mode (preview / debug).
     */
    writeBackScores: true,
    /**
     * Whether to emit Alert documents for critical risk crossings.
     * Disable in test / preview modes.
     */
    emitAlerts: true,
    /**
     * Threshold below which we don't write to DB. Re-scoring deals
     * whose score changed by 1-2 points wastes write capacity.
     */
    minScoreDeltaToPersist: 3,
};
// ============================================================
// HELPERS
// ============================================================
function toObjectId(id) {
    if (id instanceof mongoose.Types.ObjectId)
        return id;
    return new mongoose.Types.ObjectId(id);
}
/**
 * Compute health score from risk score. Pure derivation for now —
 * when deal-health.engine.ts gets ported, swap this call.
 *
 * Health is roughly the inverse of risk plus a momentum factor.
 */
function deriveHealthScore(riskScore, lastActivityDays) {
    let health = 100 - riskScore;
    // Penalize stale deals further
    if (lastActivityDays > 14)
        health -= 15;
    else if (lastActivityDays > 7)
        health -= 8;
    else if (lastActivityDays <= 2)
        health += 5; // bonus for fresh activity
    return Math.max(0, Math.min(100, Math.round(health)));
}
// ============================================================
// SERVICE CLASS
// ============================================================
class IntelligenceService {
    // -----------------------------------------------------------
    // LOAD DEAL CONTEXT
    // Fetches deals + pipeline, resolves stage names, builds the
    // normalized data structure used by all engines.
    // -----------------------------------------------------------
    async loadDealContext(input) {
        const orgId = toObjectId(input.organizationId);
        // 1. Load pipeline — default unless specified
        const PipelineModel = Pipeline;
        const pipelineQuery = { organizationId: orgId };
        if (input.pipelineId) {
            pipelineQuery._id = toObjectId(input.pipelineId);
        }
        const pipeline = await PipelineModel
            .findOne(pipelineQuery)
            .sort({ isDefault: -1, createdAt: 1 })
            .lean();
        if (!pipeline) {
            // Return empty context — engines will return empty results
            return { deals: [], pipelineId: null };
        }
        // 2. Build stageId → stageName lookup
        const stageMap = new Map();
        for (const stage of pipeline.stages ?? []) {
            stageMap.set(String(stage._id), stage.name);
        }
        // 3. Load deals — scoped + optionally filtered
        const dealQuery = {
            organizationId: orgId,
            pipelineId: pipeline._id,
            isDeleted: false,
        };
        if (input.assignedToId) {
            dealQuery.assignedTo = toObjectId(input.assignedToId);
        }
        const DealModel = Deal;
        const rawDeals = await DealModel
            .find(dealQuery)
            .limit(INTELLIGENCE_CONFIG.maxDealsPerRun)
            .lean();
        // 4. Load assigned-user names for coaching signals
        const assignedUserIds = Array
            .from(new Set(rawDeals.map((d) => d.assignedTo).filter(Boolean)))
            .map((id) => toObjectId(id));
        const UserModel = User;
        const users = assignedUserIds.length > 0
            ? await UserModel
                .find({ _id: { $in: assignedUserIds } })
                .select("_id name")
                .lean()
            : [];
        const userNameMap = new Map();
        for (const u of users) {
            if (u.name)
                userNameMap.set(String(u._id), u.name);
        }
        // 5. Compose normalized deal context
        const deals = rawDeals.map((d) => {
            const stageIdStr = String(d.stageId);
            const assignedToStr = d.assignedTo ? String(d.assignedTo) : null;
            return {
                _id: d._id,
                title: d.title ?? "Untitled Deal",
                value: d.value ?? 0,
                stageId: d.stageId,
                stageName: stageMap.get(stageIdStr) ?? "UNKNOWN",
                lastActivityAt: d.lastActivityAt ?? null,
                daysInCurrentStage: d.daysInCurrentStage ?? 0,
                ageDays: d.ageDays ?? 0,
                probability: d.probability ?? 0,
                riskScore: d.riskScore ?? 0,
                assignedTo: d.assignedTo ?? null,
                assignedToName: assignedToStr ? (userNameMap.get(assignedToStr) ?? null) : null,
                status: (d.status ?? "open"),
                expectedCloseDate: d.expectedCloseDate ?? null,
                forecastCategory: (d.forecastCategory ?? null),
                weightedValue: d.weightedValue ?? 0,
            };
        });
        return {
            deals,
            pipelineId: pipeline._id,
        };
    }
    // -----------------------------------------------------------
    // RUN ALL ENGINES
    // Runs the 5 engines in parallel. If any engine throws, the
    // error is captured but other engines still complete.
    // -----------------------------------------------------------
    async runEngines(deals) {
        const errors = [];
        // -----------------------------------------------------------
        // 1. RISK SCORING — must run first since revenue-decision needs it
        // -----------------------------------------------------------
        const riskSignalsList = deals.map((d) => {
            const signal = {
                _id: d._id,
                title: d.title,
                value: d.value,
                stageName: d.stageName,
                lastActivityAt: d.lastActivityAt,
                daysInCurrentStage: d.daysInCurrentStage,
                ageDays: d.ageDays,
                probability: d.probability,
                status: d.status,
            };
            return extractRiskSignals(signal);
        });
        let dealRisks = [];
        try {
            dealRisks = riskSignalsList.map(scoreDealRisk);
        }
        catch (err) {
            errors.push("deal-risk: " + (err?.message ?? "unknown"));
            engineLogger.error({ err }, "Risk engine failed");
        }
        // Build a riskScore lookup for downstream engines
        const riskByDealId = new Map();
        for (const r of dealRisks) {
            if (r.dealId !== undefined) {
                riskByDealId.set(String(r.dealId), r.riskScore);
            }
        }
        // -----------------------------------------------------------
        // 2-5. RUN REMAINING ENGINES IN PARALLEL
        // Each engine wrapped in soft-failure handler so one bad engine
        // doesn't take down the whole result.
        // -----------------------------------------------------------
        const attentionPromise = Promise.resolve().then(() => {
            try {
                const signals = deals.map((d) => extractAttentionSignals({
                    _id: d._id,
                    title: d.title,
                    value: d.value,
                    stageName: d.stageName,
                    lastActivityAt: d.lastActivityAt,
                    daysInCurrentStage: d.daysInCurrentStage,
                    probability: d.probability,
                    ...(d.assignedToName !== null && { assignedToName: d.assignedToName }),
                    status: d.status,
                }));
                const allAlerts = [];
                for (const s of signals) {
                    const dealAlerts = detectDealAttention(s);
                    for (const a of dealAlerts)
                        allAlerts.push(a);
                }
                return allAlerts;
            }
            catch (err) {
                errors.push("deals-attention: " + (err?.message ?? "unknown"));
                engineLogger.error({ err }, "Attention engine failed");
                return [];
            }
        });
        const forecastPromise = Promise.resolve().then(() => {
            try {
                const signals = deals.map((d) => extractForecastSignals({
                    _id: d._id,
                    title: d.title,
                    value: d.value,
                    stageName: d.stageName,
                    lastActivityAt: d.lastActivityAt,
                    probability: d.probability,
                    expectedCloseDate: d.expectedCloseDate,
                    ...(d.forecastCategory !== null && { forecastCategory: d.forecastCategory }),
                    status: d.status,
                    weightedValue: d.weightedValue,
                }));
                return detectForecastRisk(signals);
            }
            catch (err) {
                errors.push("forecast-risk: " + (err?.message ?? "unknown"));
                engineLogger.error({ err }, "Forecast engine failed");
                return detectForecastRisk([]); // empty result
            }
        });
        const leaksPromise = Promise.resolve().then(() => {
            try {
                const signals = deals.map((d) => extractPipelineLeakSignals({
                    _id: d._id,
                    title: d.title,
                    value: d.value,
                    stageName: d.stageName,
                    lastActivityAt: d.lastActivityAt,
                    ageDays: d.ageDays,
                    status: d.status,
                }));
                return detectPipelineLeaks(signals);
            }
            catch (err) {
                errors.push("pipeline-leak: " + (err?.message ?? "unknown"));
                engineLogger.error({ err }, "Pipeline leak engine failed");
                return detectPipelineLeaks([]);
            }
        });
        const actionsPromise = Promise.resolve().then(() => {
            try {
                const signals = deals.map((d) => {
                    const riskScore = riskByDealId.get(String(d._id)) ?? 0;
                    const lastActivityDays = d.lastActivityAt
                        ? Math.max(0, Math.floor((Date.now() - d.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)))
                        : 0;
                    const healthScore = deriveHealthScore(riskScore, lastActivityDays);
                    const assembleInput = {
                        _id: d._id,
                        title: d.title,
                        value: d.value,
                        stageName: d.stageName,
                        lastActivityAt: d.lastActivityAt,
                        riskScore,
                        healthScore,
                        probability: d.probability,
                        status: d.status,
                    };
                    if (d.assignedTo !== null)
                        assembleInput.assignedToId = d.assignedTo;
                    if (d.assignedToName !== null)
                        assembleInput.assignedToName = d.assignedToName;
                    if (d.forecastCategory !== null)
                        assembleInput.forecastCategory = d.forecastCategory;
                    return assembleDecisionSignals(assembleInput);
                });
                return generateRevenueActions(signals);
            }
            catch (err) {
                errors.push("revenue-decision: " + (err?.message ?? "unknown"));
                engineLogger.error({ err }, "Revenue decision engine failed");
                return generateRevenueActions([]);
            }
        });
        const [attentionAlerts, forecast, pipelineLeaks, actions] = await Promise.all([
            attentionPromise,
            forecastPromise,
            leaksPromise,
            actionsPromise,
        ]);
        return {
            dealRisks,
            attentionAlerts,
            forecast,
            pipelineLeaks,
            actions,
            errors,
        };
    }
    // -----------------------------------------------------------
    // PERSIST SCORES TO DEAL DOCUMENTS
    // Uses bulkWrite for performance. Only writes deals whose score
    // changed by >= minScoreDeltaToPersist to avoid churn.
    // -----------------------------------------------------------
    async persistScores(deals, newRisks) {
        const currentScores = new Map();
        for (const d of deals) {
            currentScores.set(String(d._id), d.riskScore);
        }
        const bulkOps = [];
        for (const result of newRisks) {
            if (result.dealId === undefined)
                continue;
            const idStr = String(result.dealId);
            const current = currentScores.get(idStr) ?? 0;
            const delta = Math.abs(result.riskScore - current);
            if (delta < INTELLIGENCE_CONFIG.minScoreDeltaToPersist)
                continue;
            bulkOps.push({
                updateOne: {
                    filter: { _id: result.dealId },
                    update: {
                        $set: {
                            riskScore: result.riskScore,
                            riskLevel: result.riskLevel,
                            riskCalculatedAt: result.computedAt,
                            riskFactors: result.factors.map((f) => ({
                                factor: f.code,
                                weight: f.weight,
                                detectedAt: result.computedAt,
                                resolved: false,
                            })),
                        },
                    },
                },
            });
        }
        if (bulkOps.length === 0)
            return 0;
        const DealModel = Deal;
        const result = await DealModel.bulkWrite(bulkOps);
        return result.modifiedCount ?? 0;
    }
    // -----------------------------------------------------------
    // EMIT ALERTS FOR CRITICAL CROSSINGS
    // Generates Alert documents for newly-critical deals.
    // Dedup via existing Alert.dedupKey index.
    // -----------------------------------------------------------
    async emitAlertsForCritical(organizationId, newRisks, previousScores, actorId) {
        if (!INTELLIGENCE_CONFIG.emitAlerts)
            return 0;
        const alertsToCreate = [];
        for (const result of newRisks) {
            if (result.dealId === undefined)
                continue;
            if (result.riskScore < 80)
                continue; // only critical
            const idStr = String(result.dealId);
            const previousScore = previousScores.get(idStr) ?? 0;
            // Only emit on CROSSING — not every nightly run for the same deal
            if (previousScore >= 80)
                continue;
            // Build dedup key: same deal + same engine version → one alert per day
            const today = new Date().toISOString().slice(0, 10);
            const dedupKey = "deal-risk-critical:" + idStr + ":" + result.engineVersion + ":" + today;
            const topFactor = result.factors[0];
            const alertDoc = {
                type: "risk",
                severity: "critical",
                title: "Deal at critical risk: " + result.name,
                message: topFactor
                    ? "Risk score crossed " + result.riskScore + ". Top factor: " + topFactor.message
                    : "Risk score reached " + result.riskScore + ".",
                relatedTo: {
                    type: "deal",
                    id: result.dealId,
                },
                organizationId,
                status: "open",
                isRead: false,
                dedupKey,
                source: "deal-risk-engine",
                impactScore: result.riskScore,
                metadata: {
                    riskScore: result.riskScore,
                    riskLevel: result.riskLevel,
                    factorCount: result.factors.length,
                    engineVersion: result.engineVersion,
                },
            };
            if (actorId)
                alertDoc.triggeredBy = actorId;
            alertsToCreate.push(alertDoc);
        }
        if (alertsToCreate.length === 0)
            return 0;
        const AlertModel = Alert;
        try {
            const created = await AlertModel.insertMany(alertsToCreate, { ordered: false } // continue on duplicate-key errors from dedupKey
            );
            return created.length;
        }
        catch (err) {
            // Duplicate-key errors are EXPECTED (dedup working as intended).
            // We treat them as a soft failure — partial inserts succeed.
            const e = err;
            const insertedCount = Array.isArray(e?.insertedDocs) ? e.insertedDocs.length : 0;
            if (insertedCount > 0) {
                return insertedCount;
            }
            dbLogger.warn("Alert insertMany partial failure: " +
                (err?.message ?? "unknown"));
            return 0;
        }
    }
    // -----------------------------------------------------------
    // EMIT ALERTS FROM ATTENTION ENGINE
    // Persists urgent/high attention alerts (deals going quiet, stalled
    // negotiations, hot leads cooling, etc.) into the Alert collection so
    // they show on the Alerts page. Works on deals that have real activity
    // history — fresh imports with no activity won't trigger (by design).
    // Dedup via dedupKey: one alert per deal+type per day.
    // -----------------------------------------------------------
    async emitAlertsFromAttention(organizationId, attentionAlerts, actorId) {
        if (!INTELLIGENCE_CONFIG.emitAlerts)
            return 0;
        const today = new Date().toISOString().slice(0, 10);
        const alertsToCreate = [];
        for (const att of attentionAlerts) {
            // Only persist the alerts that matter — urgent/high only.
            if (att.priority === "low")
                continue;
            if (att.dealId === undefined)
                continue;
            const idStr = String(att.dealId);
            // Map attention priority -> Alert severity vocabulary
            const severity = att.priority === "critical" ? "critical" :
                att.priority === "high" ? "high" : "medium";
            // One alert per deal + attention-type + day
            const dedupKey = "deal-attention:" + idStr + ":" + att.type + ":" + today;
            const alertDoc = {
                type: "warning",
                severity,
                title: att.dealName,
                message: att.message,
                relatedTo: {
                    type: "deal",
                    id: att.dealId,
                },
                organizationId,
                status: "open",
                isRead: false,
                dedupKey,
                source: "deals-attention-engine",
                impactScore: att.impactScore,
                recommendedAction: att.recommendedAction,
                metadata: {
                    attentionType: att.type,
                    priority: att.priority,
                    engineVersion: att.engineVersion,
                },
            };
            if (actorId)
                alertDoc.triggeredBy = actorId;
            alertsToCreate.push(alertDoc);
        }
        if (alertsToCreate.length === 0)
            return 0;
        const AlertModel = Alert;
        try {
            const created = await AlertModel.insertMany(alertsToCreate, { ordered: false } // continue past duplicate-key (dedup) errors
            );
            return created.length;
        }
        catch (err) {
            // Duplicate-key errors are EXPECTED (dedup working). Count partial inserts.
            const e = err;
            const insertedCount = Array.isArray(e?.insertedDocs) ? e.insertedDocs.length : 0;
            if (insertedCount > 0)
                return insertedCount;
            dbLogger.warn("Attention alert insertMany partial failure: " +
                (err?.message ?? "unknown"));
            return 0;
        }
    }
    // -----------------------------------------------------------
    // MAIN RUN — orchestrate everything
    // -----------------------------------------------------------
    /**
     * Run the full intelligence orchestration for an organization.
     *
     * Steps:
     *   1. Load deals + pipeline + users
     *   2. Run all 5 engines in parallel
     *   3. Persist updated risk scores to Deal docs (unless dryRun)
     *   4. Emit alerts for newly-critical deals (unless skipAlerts)
     *   5. Return composed result
     */
    async run(input) {
        const startedAt = Date.now();
        const dryRun = input.dryRun === true;
        dbLogger.info("Intelligence run starting: " +
            "org=" + String(input.organizationId) +
            " dryRun=" + dryRun);
        // 1. Load context
        const { deals, pipelineId } = await this.loadDealContext(input);
        if (deals.length === 0) {
            // Empty pipeline — return empty result
            const emptyForecast = detectForecastRisk([]);
            const emptyLeaks = detectPipelineLeaks([]);
            const emptyActions = generateRevenueActions([]);
            return {
                organizationId: String(input.organizationId),
                ...(pipelineId && { pipelineId: String(pipelineId) }),
                dealRisks: [],
                attentionAlerts: [],
                forecast: emptyForecast,
                pipelineLeaks: emptyLeaks,
                actions: emptyActions,
                meta: {
                    orchestratorVersion: INTELLIGENCE_CONFIG.orchestratorVersion,
                    engineVersions: {
                        dealRisk: DEAL_RISK_ENGINE_VERSION,
                        dealsAttention: DEALS_ATTENTION_ENGINE_VERSION,
                        forecastRisk: FORECAST_RISK_ENGINE_VERSION,
                        pipelineLeak: PIPELINE_LEAK_ENGINE_VERSION,
                        revenueDecision: REVENUE_DECISION_ENGINE_VERSION,
                    },
                    dealsProcessed: 0,
                    dealsSkipped: 0,
                    dealsUpdated: 0,
                    alertsEmitted: 0,
                    durationMs: Date.now() - startedAt,
                    errors: [],
                    computedAt: new Date().toISOString(),
                    dryRun,
                },
            };
        }
        // 2. Run engines
        const previousScores = new Map();
        for (const d of deals) {
            previousScores.set(String(d._id), d.riskScore);
        }
        const engineResult = await this.runEngines(deals);
        // 3. Persist scores
        let dealsUpdated = 0;
        if (!dryRun && INTELLIGENCE_CONFIG.writeBackScores) {
            try {
                dealsUpdated = await this.persistScores(deals.map((d) => ({ _id: d._id, riskScore: d.riskScore })), engineResult.dealRisks);
            }
            catch (err) {
                const msg = "persist-scores: " + (err?.message ?? "unknown");
                engineResult.errors.push(msg);
                dbLogger.error(msg);
            }
        }
        // 4. Emit alerts — critical risk crossings + attention alerts
        let alertsEmitted = 0;
        if (!dryRun && !input.skipAlerts && INTELLIGENCE_CONFIG.emitAlerts) {
            try {
                alertsEmitted = await this.emitAlertsForCritical(toObjectId(input.organizationId), engineResult.dealRisks, previousScores, input.actorId ? toObjectId(input.actorId) : undefined);
            }
            catch (err) {
                const msg = "emit-alerts: " + (err?.message ?? "unknown");
                engineResult.errors.push(msg);
                dbLogger.error(msg);
            }
            // Attention-based alerts (deals going quiet, stalled, etc.)
            try {
                const attentionEmitted = await this.emitAlertsFromAttention(toObjectId(input.organizationId), engineResult.attentionAlerts, input.actorId ? toObjectId(input.actorId) : undefined);
                alertsEmitted += attentionEmitted;
            }
            catch (err) {
                const msg = "emit-attention-alerts: " + (err?.message ?? "unknown");
                engineResult.errors.push(msg);
                dbLogger.error(msg);
            }
        }
        const durationMs = Date.now() - startedAt;
        dbLogger.info("Intelligence run complete: " +
            "org=" + String(input.organizationId) +
            " deals=" + deals.length +
            " updated=" + dealsUpdated +
            " alerts=" + alertsEmitted +
            " durationMs=" + durationMs +
            " errors=" + engineResult.errors.length);
        return {
            organizationId: String(input.organizationId),
            ...(pipelineId && { pipelineId: String(pipelineId) }),
            dealRisks: engineResult.dealRisks,
            attentionAlerts: engineResult.attentionAlerts,
            forecast: engineResult.forecast,
            pipelineLeaks: engineResult.pipelineLeaks,
            actions: engineResult.actions,
            meta: {
                orchestratorVersion: INTELLIGENCE_CONFIG.orchestratorVersion,
                engineVersions: {
                    dealRisk: DEAL_RISK_ENGINE_VERSION,
                    dealsAttention: DEALS_ATTENTION_ENGINE_VERSION,
                    forecastRisk: FORECAST_RISK_ENGINE_VERSION,
                    pipelineLeak: PIPELINE_LEAK_ENGINE_VERSION,
                    revenueDecision: REVENUE_DECISION_ENGINE_VERSION,
                },
                dealsProcessed: deals.length,
                dealsSkipped: 0,
                dealsUpdated,
                alertsEmitted,
                durationMs,
                errors: engineResult.errors,
                computedAt: new Date().toISOString(),
                dryRun,
            },
        };
    }
    // -----------------------------------------------------------
    // CONVENIENCE METHODS
    // -----------------------------------------------------------
    /**
     * Re-score a single deal on demand. Used when a user explicitly
     * clicks "Refresh intelligence on this deal."
     */
    async refreshOneDeal(dealId, organizationId, actorId) {
        const result = await this.run({
            organizationId,
            ...(actorId && { actorId }),
        });
        const idStr = String(dealId);
        return result.dealRisks.find((r) => String(r.dealId) === idStr) ?? null;
    }
    /**
     * Dry-run preview — runs engines but doesn't persist or emit alerts.
     * Useful for "preview impact of this change" flows.
     */
    async preview(input) {
        return this.run({ ...input, dryRun: true });
    }
}
// ============================================================
// EXPORTS
// ============================================================
const intelligenceService = new IntelligenceService();
export default intelligenceService;
export { IntelligenceService };
//# sourceMappingURL=intelligence.service.js.map