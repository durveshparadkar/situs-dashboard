import Lead from "./lead.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import AlertService from "../alerts/alert.service.js";
import { LeadSource } from "../../shared/enums/lead.enums.js";

/* =====================================================
   TYPES
===================================================== */

type Priority = "low" | "medium" | "high" | "critical";

interface ScoreResult {
  score: number;
  isStale: boolean;
  priority: Priority;
}

/* =====================================================
   CONFIG (EASY TO TUNE)
===================================================== */

const SCORE_CONFIG = {
  budget: {
    high: { threshold: 5_000_000, score: 30 },
    mid: { threshold: 2_000_000, score: 20 },
    low: { score: 10 },
  },

  recency: {
    day1: 25,
    day3: 20,
    day7: 10,
    stalePenalty: -5,
    staleThreshold: 7,
  },

  engagement: {
    high: { count: 10, score: 15 },
    mid: { count: 5, score: 10 },
    low: { count: 1, score: 5 },
  },

  source: {
    inbound: 5,
    referral: 3,
  },

  priority: {
    critical: 80,
    high: 60,
    medium: 40,
  },
};

/* =====================================================
   SOURCE CATEGORIES
   The LeadSource enum has 50+ specific values. We bucket the
   "inbound" and "referral" categories here for scoring.
   Add more values to each Set as the enum grows.
===================================================== */

const INBOUND_SOURCES: ReadonlySet<string> = new Set<string>([
  LeadSource.WEBSITE,
  LeadSource.WEBSITE_FORM,
  LeadSource.WEBSITE_CHAT,
  LeadSource.ORGANIC_SEARCH,
  LeadSource.CONTENT_DOWNLOAD,
  // TODO: add other inbound-style enum values here
]);

const REFERRAL_SOURCES: ReadonlySet<string> = new Set<string>([
  // TODO: add your referral-style enum values here, e.g.:
  // LeadSource.REFERRAL,
  // LeadSource.CUSTOMER_REFERRAL,
  // LeadSource.PARTNER_REFERRAL,
]);

/* =====================================================
   HELPERS
===================================================== */

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function calculatePriority(score: number): Priority {
  if (score >= SCORE_CONFIG.priority.critical) return "critical";
  if (score >= SCORE_CONFIG.priority.high) return "high";
  if (score >= SCORE_CONFIG.priority.medium) return "medium";
  return "low";
}

function getDaysDiff(date: Date) {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  return diff / (1000 * 60 * 60 * 24);
}

/* =====================================================
   SERVICE
===================================================== */

class LeadScoreService {
  async calculateLeadScore(leadId: string): Promise<ScoreResult> {
    /* =====================================================
       FETCH IN PARALLEL (FASTER)
    ====================================================== */

    const lead = await Lead.findById(leadId);
    if (!lead) throw new Error("Lead not found");

    const pipelinePromise = Pipeline.findById(lead.pipelineId).lean();

    let score = 0;

    /* =====================================================
       1️⃣ BUDGET SCORE
    ====================================================== */

    if (lead.budget >= SCORE_CONFIG.budget.high.threshold) {
      score += SCORE_CONFIG.budget.high.score;
    } else if (lead.budget >= SCORE_CONFIG.budget.mid.threshold) {
      score += SCORE_CONFIG.budget.mid.score;
    } else {
      score += SCORE_CONFIG.budget.low.score;
    }

    /* =====================================================
       2️⃣ STAGE SCORE
    ====================================================== */

    const pipeline = await pipelinePromise;

    if (pipeline?.stages?.length) {
      const stage = pipeline.stages.find(
        (s) => String(s._id) === String(lead.stageId)
      );

      if (stage?.probability) {
        score += Math.min(stage.probability, 25);
      }
    }

    /* =====================================================
       3️⃣ RECENCY SCORE
    ====================================================== */

    const lastActivity = lead.lastActivityAt ?? lead.createdAt;
    const diffDays = getDaysDiff(lastActivity);

    let isStale = false;

    if (diffDays <= 1) score += SCORE_CONFIG.recency.day1;
    else if (diffDays <= 3) score += SCORE_CONFIG.recency.day3;
    else if (diffDays <= 7) score += SCORE_CONFIG.recency.day7;
    else {
      score += SCORE_CONFIG.recency.stalePenalty;
      isStale = true;
    }

    /* =====================================================
       4️ ENGAGEMENT SCORE
    ====================================================== */

    const activityCount = lead.activityCount ?? 0;

    if (activityCount >= SCORE_CONFIG.engagement.high.count) {
      score += SCORE_CONFIG.engagement.high.score;
    } else if (activityCount >= SCORE_CONFIG.engagement.mid.count) {
      score += SCORE_CONFIG.engagement.mid.score;
    } else if (activityCount >= SCORE_CONFIG.engagement.low.count) {
      score += SCORE_CONFIG.engagement.low.score;
    }

    /* =====================================================
       5️⃣ SOURCE BOOST
       Buckets the 50+ source enum values into inbound/referral.
    ====================================================== */

    const leadSource = String(lead.source);

    if (INBOUND_SOURCES.has(leadSource)) {
      score += SCORE_CONFIG.source.inbound;
    } else if (REFERRAL_SOURCES.has(leadSource)) {
      score += SCORE_CONFIG.source.referral;
    }

    /* =====================================================
       FINAL NORMALIZATION
    ====================================================== */

    score = clampScore(score);

    const priority = calculatePriority(score);

    /* =====================================================
       SAVE (ONLY IF CHANGED → PERFORMANCE)
    ====================================================== */

    const shouldUpdate =
      lead.leadScore !== score ||
      lead.isStale !== isStale ||
      lead.brainPriority !== priority;

    if (shouldUpdate) {
      lead.leadScore = score;
      lead.isStale = isStale;
      lead.brainPriority = priority;
      await lead.save();
    }

    /* =====================================================
       🚨 ALERT ENGINE (NON-BLOCKING)
    ====================================================== */

    this.triggerAlerts(lead, score, isStale).catch(() => {
      // fail silently (never break scoring)
    });

    return { score, isStale, priority };
  }

  /* =====================================================
     ALERT HANDLER (DECOUPLED)
  ====================================================== */

  private async triggerAlerts(
    lead: any,
    score: number,
    isStale: boolean
  ) {
    // 🟢 Hot Lead
    if (score >= 80) {
      await AlertService.createAlert({
        type: "opportunity",
        severity: "high",
        title: "Hot Lead",
        message: "This lead is highly likely to convert",
        relatedTo: {
          type: "lead",
          id: lead._id,
        },
        organizationId: lead.organizationId,
      });
    }

    // 🟡 Stale Lead
    if (isStale) {
      await AlertService.createAlert({
        type: "warning",
        severity: "medium",
        title: "Stale Lead",
        message: "No recent activity on this lead",
        relatedTo: {
          type: "lead",
          id: lead._id,
        },
        organizationId: lead.organizationId,
      });
    }
  }
}

export default new LeadScoreService();