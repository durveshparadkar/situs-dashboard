import Deal from "./deal.model.js";
import AlertService from "../alerts/alert.service.js";

class DealRiskService {
  async calculateRisk(dealId: string) {
    const deal = await Deal.findById(dealId);
    if (!deal) return;

    let risk = 0;

    const now = new Date();
    const diffDays =
      (now.getTime() - new Date(deal.lastActivityAt).getTime()) /
      (1000 * 60 * 60 * 24);

    /* ============================
       1️⃣ INACTIVITY
    ============================ */
    if (diffDays > 10) risk += 40;
    else if (diffDays > 5) risk += 25;
    else if (diffDays > 2) risk += 10;

    /* ============================
       2️⃣ LOW ENGAGEMENT
    ============================ */
    if (deal.activityCount < 2) risk += 20;
    else if (deal.activityCount < 5) risk += 10;

    /* ============================
       3️⃣ LOW PROBABILITY
    ============================ */
    if (deal.probability < 30) risk += 20;
    else if (deal.probability < 50) risk += 10;

    /* ============================
       FINAL NORMALIZATION
    ============================ */
    risk = Math.max(0, Math.min(100, risk));

    let level: "low" | "medium" | "high" | "critical" = "low";

    if (risk >= 70) level = "critical";
    else if (risk >= 50) level = "high";
    else if (risk >= 30) level = "medium";

    /* ============================
       SAVE
    ============================ */
    deal.riskScore = risk;
    deal.riskLevel = level;

    await deal.save();

    /* ============================
       🚨 ALERT ENGINE (NEW)
    ============================ */

    // 🔴 High Risk Deal Alert
    if (risk >= 70) {
      await AlertService.createAlert({
        type: "risk",
        severity: "high",
        title: "High Risk Deal",
        message: "This deal is likely to be lost due to inactivity or low engagement",
        relatedTo: {
          type: "deal",
          id: deal._id,
        },
        organizationId: deal.organizationId,
      });
    }

    // 🟡 Medium Risk Warning
    if (risk >= 50 && risk < 70) {
      await AlertService.createAlert({
        type: "warning",
        severity: "medium",
        title: "Deal Needs Attention",
        message: "This deal is showing signs of risk",
        relatedTo: {
          type: "deal",
          id: deal._id,
        },
        organizationId: deal.organizationId,
      });
    }
  }
}

export default new DealRiskService();