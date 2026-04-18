import Lead from "./lead.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import AlertService from "../alerts/alert.service.js";

class LeadScoreService {
  async calculateLeadScore(leadId: string) {
    const lead = await Lead.findById(leadId);
    if (!lead) throw new Error("Lead not found");

    let score = 0;

    /* ============================
       1️⃣ BUDGET SCORE (30)
    ============================ */
    if (lead.budget >= 5000000) {
      score += 30;
    } else if (lead.budget >= 2000000) {
      score += 20;
    } else {
      score += 10;
    }

    /* ============================
       2️⃣ STAGE SCORE (25)
    ============================ */
    const pipeline = await Pipeline.findById(lead.pipelineId);

    if (pipeline) {
      const stage = pipeline.stages.find(
        (s: any) => s._id.toString() === lead.stageId.toString()
      );

      if (stage) {
        score += Math.min(stage.probability || 0, 25);
      }
    }

    /* ============================
       3️⃣ RECENCY SCORE (25)
    ============================ */
    const now = new Date();
    const lastActivity = lead.lastActivityAt || lead.createdAt;

    const diffDays =
      (now.getTime() - new Date(lastActivity).getTime()) /
      (1000 * 60 * 60 * 24);

    if (diffDays <= 1) score += 25;
    else if (diffDays <= 3) score += 20;
    else if (diffDays <= 7) score += 10;
    else score -= 5;

    /* ============================
       4️⃣ ENGAGEMENT
    ============================ */
    const activityCount = lead.activityCount || 0;

    if (activityCount >= 10) score += 15;
    else if (activityCount >= 5) score += 10;
    else if (activityCount >= 1) score += 5;

    /* ============================
       5️⃣ SOURCE BOOST
    ============================ */
    if (lead.source === "inbound") score += 5;
    else if (lead.source === "referral") score += 3;

    /* ============================
       6️⃣ STALE CHECK
    ============================ */
    let isStale = false;

    if (diffDays > 7) {
      isStale = true;
      score -= 10;
    }

    /* ============================
       FINAL NORMALIZATION
    ============================ */
    score = Math.max(0, Math.min(score, 100));

    /* ============================
       PRIORITY SYSTEM
    ============================ */
    let priority: "low" | "medium" | "high" | "critical" = "low";

    if (score >= 80) priority = "critical";
    else if (score >= 60) priority = "high";
    else if (score >= 40) priority = "medium";

    /* ============================
       SAVE
    ============================ */
    lead.leadScore = score;
    lead.isStale = isStale;
    lead.brainPriority = priority;

    await lead.save();

    /* ============================
       🚨 ALERT ENGINE (NEW)
    ============================ */

    // 🟢 Hot Lead (Opportunity)
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

    // 🟡 Stale Lead Warning
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

    return {
      score,
      isStale,
      priority,
    };
  }
}

export default new LeadScoreService();