import Deal from "./deal.model.js";
import DealRiskService from "./dealRisk.service.js";

class DealService {
  /* ============================
     CREATE DEAL
  ============================ */
  async createDeal(data: any, userId: string, orgId: string) {
    if (!data.title || !data.value) {
      throw new Error("Missing required fields");
    }

    const deal = await Deal.create({
      ...data,
      organizationId: orgId,
      assignedTo: userId,
      activityCount: 0,
      lastActivityAt: new Date(),
    });

    // 🔥 Initial risk calculation
    await DealRiskService.calculateRisk(deal._id.toString());

    return deal;
  }

  /* ============================
     GET DEALS
  ============================ */
  async getDeals(orgId: string) {
    return Deal.find({ organizationId: orgId }).sort({
      createdAt: -1,
    });
  }

  /* ============================
     UPDATE DEAL (🔥 INTELLIGENCE CONNECTED)
  ============================ */
  async updateDeal(dealId: string, updates: any, userId: string) {
    const deal = await Deal.findById(dealId);

    if (!deal) throw new Error("Deal not found");

    // 🔐 Security check
    if (deal.assignedTo.toString() !== userId) {
      throw new Error("Unauthorized");
    }

    // Apply updates
    Object.assign(deal, updates);

    await deal.save();

    /* ============================
       🔥 ACTIVITY TRACKING (CORE)
    ============================ */
    await Deal.findByIdAndUpdate(dealId, {
      $inc: { activityCount: 1 },
      lastActivityAt: new Date(),
    });

    /* ============================
       🔥 RISK ENGINE TRIGGER
    ============================ */
    await DealRiskService.calculateRisk(dealId);

    return deal;
  }
}

export default new DealService();