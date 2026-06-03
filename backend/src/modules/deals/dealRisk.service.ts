import mongoose, { Types } from "mongoose";
import Deal, { DealDocument, RiskLevel, IRiskFactor } from "./deal.model.js";
import AlertService from "../alerts/alert.service.js";
import logger from "../../utils/logger.js";

/* ================= CONFIG ================= */

const RISK_CONFIG = {
  inactivity: {
    critical: { days: 21, weight: 35 },
    high:     { days: 14, weight: 25 },
    medium:   { days:  7, weight: 15 },
    low:      { days:  3, weight:  8 },
  },
  engagement: {
    none:    { count: 0, weight: 20 },
    minimal: { count: 1, weight: 15 },
    low:     { count: 3, weight:  8 },
  },
  probability: {
    veryLow: { threshold: 15, weight: 20 },
    low:     { threshold: 30, weight: 12 },
    medium:  { threshold: 50, weight:  5 },
  },
  value: {
    enterprise: { threshold: 5_000_000, weight: 10 },
    midMarket:  { threshold: 1_000_000, weight:  5 },
  },
  stageStagnation: {
    extreme: { days: 60, weight: 20 },
    high:    { days: 30, weight: 12 },
    medium:  { days: 14, weight:  6 },
  },
  closeDate: {
    overdue:  { weight: 25 },
    imminent: { days: 7, weight: 8 },
  },
  thresholds: {
    critical: 70,
    high:     50,
    medium:   30,
  },
  alertCooldownHours: 24,
} as const;

/* ================= TYPES ================= */

export interface RiskCalculationResult {
  dealId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: IRiskFactor[];
  changed: boolean;
  previousScore?: number;
  previousLevel?: RiskLevel;
}

interface RiskSignal {
  factor: string;
  weight: number;
  reason: string;
}

/* ================= HELPERS ================= */

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function daysSince(date: Date | undefined | null): number {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= RISK_CONFIG.thresholds.critical) return "critical";
  if (score >= RISK_CONFIG.thresholds.high)     return "high";
  if (score >= RISK_CONFIG.thresholds.medium)   return "medium";
  return "low";
}

/* ================= SERVICE ================= */

class DealRiskService {

  /* ── CALCULATE RISK ── */
  async calculateRisk(dealId: string): Promise<RiskCalculationResult | null> {
    if (!mongoose.Types.ObjectId.isValid(dealId)) {
      logger.warn({ dealId }, "Invalid dealId passed to risk engine");
      return null;
    }

    const deal = await Deal.findById(dealId);
    if (!deal) {
      logger.warn({ dealId }, "Deal not found in risk engine");
      return null;
    }

    if (deal.status === "won" || deal.status === "lost") {
      return null;
    }

    const previousScore = deal.riskScore;
    const previousLevel = deal.riskLevel;

    const signals: RiskSignal[] = [
      ...this.detectInactivity(deal),
      ...this.detectLowEngagement(deal),
      ...this.detectLowProbability(deal),
      ...this.detectHighValueSensitivity(deal),
      ...this.detectStageStagnation(deal),
      ...this.detectCloseDateRisk(deal),
    ];

    const rawScore  = signals.reduce((sum, s) => sum + s.weight, 0);
    const riskScore = clamp(rawScore);
    const riskLevel = getRiskLevel(riskScore);

    const riskFactors: IRiskFactor[] = signals.map((s) => ({
      factor:     s.factor,
      weight:     s.weight,
      detectedAt: new Date(),
      resolved:   false,
    }));

    const changed =
      previousScore !== riskScore || previousLevel !== riskLevel;

    if (!changed) {
      return {
        dealId,
        riskScore,
        riskLevel,
        riskFactors: deal.riskFactors ?? [],
        changed: false,
        previousScore,
        previousLevel,
      };
    }

    deal.riskScore        = riskScore;
    deal.riskLevel        = riskLevel;
    deal.riskFactors      = riskFactors;
    deal.riskCalculatedAt = new Date();

    await deal.save();

    logger.info(
      { dealId, riskScore, riskLevel, previousScore, previousLevel, signalCount: signals.length },
      "Risk recalculated"
    );

    await this.handleAlerts(deal, previousLevel, signals);

    return {
      dealId,
      riskScore,
      riskLevel,
      riskFactors,
      changed: true,
      previousScore,
      previousLevel,
    };
  }

  /* ── SIGNAL DETECTORS ── */

  private detectInactivity(deal: DealDocument): RiskSignal[] {
    const days = daysSince(deal.lastActivityAt);
    const cfg  = RISK_CONFIG.inactivity;

    if (days >= cfg.critical.days) {
      return [{ factor: `inactivity_${cfg.critical.days}d`, weight: cfg.critical.weight, reason: `No activity for ${Math.floor(days)} days` }];
    }
    if (days >= cfg.high.days) {
      return [{ factor: `inactivity_${cfg.high.days}d`, weight: cfg.high.weight, reason: `No activity for ${Math.floor(days)} days` }];
    }
    if (days >= cfg.medium.days) {
      return [{ factor: `inactivity_${cfg.medium.days}d`, weight: cfg.medium.weight, reason: `Limited activity in past ${Math.floor(days)} days` }];
    }
    if (days >= cfg.low.days) {
      return [{ factor: `inactivity_${cfg.low.days}d`, weight: cfg.low.weight, reason: "Recent activity slowing down" }];
    }
    return [];
  }

  private detectLowEngagement(deal: DealDocument): RiskSignal[] {
    const count = deal.activityCount ?? 0;
    const cfg   = RISK_CONFIG.engagement;

    if (count <= cfg.none.count) {
      return [{ factor: "no_engagement", weight: cfg.none.weight, reason: "Zero activities logged on this deal" }];
    }
    if (count <= cfg.minimal.count) {
      return [{ factor: "minimal_engagement", weight: cfg.minimal.weight, reason: `Only ${count} activity logged` }];
    }
    if (count <= cfg.low.count) {
      return [{ factor: "low_engagement", weight: cfg.low.weight, reason: `Only ${count} activities logged` }];
    }
    return [];
  }

  private detectLowProbability(deal: DealDocument): RiskSignal[] {
    const prob = deal.probability ?? 0;
    const cfg  = RISK_CONFIG.probability;

    if (prob < cfg.veryLow.threshold) {
      return [{ factor: "very_low_probability", weight: cfg.veryLow.weight, reason: `Probability is only ${prob}%` }];
    }
    if (prob < cfg.low.threshold) {
      return [{ factor: "low_probability", weight: cfg.low.weight, reason: `Probability below 30% (${prob}%)` }];
    }
    if (prob < cfg.medium.threshold) {
      return [{ factor: "medium_probability", weight: cfg.medium.weight, reason: `Probability below 50% (${prob}%)` }];
    }
    return [];
  }

  private detectHighValueSensitivity(deal: DealDocument): RiskSignal[] {
    const cfg = RISK_CONFIG.value;

    if (deal.value >= cfg.enterprise.threshold) {
      return [{ factor: "high_value_enterprise", weight: cfg.enterprise.weight, reason: "Enterprise-tier deal — extra scrutiny needed" }];
    }
    if (deal.value >= cfg.midMarket.threshold) {
      return [{ factor: "high_value_midmarket", weight: cfg.midMarket.weight, reason: "Mid-market deal — extra scrutiny needed" }];
    }
    return [];
  }

  private detectStageStagnation(deal: DealDocument): RiskSignal[] {
    const lastTransition =
      deal.stageHistory?.[deal.stageHistory.length - 1]?.enteredAt ??
      deal.updatedAt;

    const days = daysSince(lastTransition);
    const cfg  = RISK_CONFIG.stageStagnation;

    if (days >= cfg.extreme.days) {
      return [{ factor: `stage_stagnation_${cfg.extreme.days}d`, weight: cfg.extreme.weight, reason: `Stuck in current stage for ${Math.floor(days)} days` }];
    }
    if (days >= cfg.high.days) {
      return [{ factor: `stage_stagnation_${cfg.high.days}d`, weight: cfg.high.weight, reason: `In current stage for ${Math.floor(days)} days` }];
    }
    if (days >= cfg.medium.days) {
      return [{ factor: `stage_stagnation_${cfg.medium.days}d`, weight: cfg.medium.weight, reason: `In current stage for ${Math.floor(days)} days` }];
    }
    return [];
  }

  private detectCloseDateRisk(deal: DealDocument): RiskSignal[] {
    if (!deal.expectedCloseDate) return [];

    const signals: RiskSignal[] = [];
    const cfg     = RISK_CONFIG.closeDate;
    const close   = new Date(deal.expectedCloseDate).getTime();
    const now     = Date.now();
    const daysOut = (close - now) / (1000 * 60 * 60 * 24);

    if (daysOut < 0) {
      signals.push({
        factor: "close_date_overdue",
        weight: cfg.overdue.weight,
        reason: `Expected close date passed ${Math.floor(-daysOut)} days ago`,
      });
    } else if (daysOut <= cfg.imminent.days) {
      const isShaky =
        (deal.probability ?? 0) < 60 ||
        daysSince(deal.lastActivityAt) > 5;

      if (isShaky) {
        signals.push({
          factor: "close_imminent_unprepared",
          weight: cfg.imminent.weight,
          reason: `Closes in ${Math.floor(daysOut)} days but momentum is weak`,
        });
      }
    }

    return signals;
  }

  /* ── ALERTING ── */
  private async handleAlerts(
    deal: DealDocument,
    previousLevel: RiskLevel,
    signals: RiskSignal[]
  ): Promise<void> {
    const levelOrder: Record<RiskLevel, number> = {
      low: 0, medium: 1, high: 2, critical: 3,
    };

    const escalated = levelOrder[deal.riskLevel] > levelOrder[previousLevel];
    if (!escalated) return;

    const topReasons = signals
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((s) => `• ${s.reason}`)
      .join("\n");

    try {
      if (deal.riskLevel === "critical") {
        await AlertService.createAlert({
          type:     "risk",
          severity: "high",
          title:    `Critical risk: ${deal.title}`,
          message:  `This deal needs immediate attention.\n\nTop signals:\n${topReasons}`,
          relatedTo: { type: "deal", id: deal._id as Types.ObjectId },
          organizationId: deal.organizationId,
        });
      } else if (deal.riskLevel === "high") {
        await AlertService.createAlert({
          type:     "warning",
          severity: "medium",
          title:    `Deal needs attention: ${deal.title}`,
          message:  `This deal is showing risk signals.\n\nTop signals:\n${topReasons}`,
          relatedTo: { type: "deal", id: deal._id as Types.ObjectId },
          organizationId: deal.organizationId,
        });
      }
    } catch (err) {
      logger.error(
        { dealId: deal._id, riskLevel: deal.riskLevel, error: (err as Error).message },
        "Alert creation failed in risk engine"
      );
    }
  }

  /* ── BATCH RECALC ── */
  async recalculateForOrg(orgId: string): Promise<{
    processed: number;
    changed: number;
    errors: number;
  }> {
    if (!mongoose.Types.ObjectId.isValid(orgId)) {
      throw new Error("Invalid orgId");
    }

    let processed = 0;
    let changed   = 0;
    let errors    = 0;

    const cursor = Deal.find({
      organizationId: orgId,
      isDeleted: false,
      status: "open",
    }).cursor();

    for await (const deal of cursor) {
      processed++;
      try {
        const result = await this.calculateRisk(deal._id.toString());
        if (result?.changed) changed++;
      } catch (err) {
        errors++;
        logger.error(
          { dealId: deal._id, error: (err as Error).message },
          "Batch risk calc error"
        );
      }
    }

    logger.info({ orgId, processed, changed, errors }, "Batch risk recalculation complete");

    return { processed, changed, errors };
  }

  /* ── EXPLAIN RISK ── */
async explainRisk(dealId: string): Promise<{
  dealId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  factors: IRiskFactor[];
  calculatedAt?: Date | undefined;
} | null> {
  if (!mongoose.Types.ObjectId.isValid(dealId)) return null;

  const deal = await Deal.findById(dealId)
    .select("riskScore riskLevel riskFactors riskCalculatedAt")
    .lean();

  if (!deal) return null;

  return {
    dealId,
    riskScore:    deal.riskScore,
    riskLevel:    deal.riskLevel,
    factors:      deal.riskFactors ?? [],
    calculatedAt: deal.riskCalculatedAt,
  };
}
}

export default new DealRiskService();