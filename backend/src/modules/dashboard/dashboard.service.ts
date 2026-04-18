import mongoose from "mongoose";
import Lead from "../leads/lead.model.js";
import User from "../users/user.model.js";

interface CurrentUser {
  _id: string;
  role: "ADMIN" | "MANAGER" | "AGENT";
  organizationId: string;
}

class DashboardService {
  async getSummary(currentUser: CurrentUser) {
    const orgId = new mongoose.Types.ObjectId(currentUser.organizationId);
    const userId = new mongoose.Types.ObjectId(currentUser._id);

    const baseMatch: any = {
      organizationId: orgId,
      isArchived: false,
    };

    /* ===============================
       ROLE VISIBILITY
    =============================== */

    if (currentUser.role === "AGENT") {
      baseMatch.assignedTo = userId;
    }

    if (currentUser.role === "MANAGER") {
      const teamMembers = await User.find({
        organizationId: orgId,
        managerId: userId,
      }).select("_id");

      const teamIds = teamMembers.map((u) => u._id);

      baseMatch.assignedTo = {
        $in: [userId, ...teamIds],
      };
    }

    /* ===============================
       TOTAL LEADS
    =============================== */

    const totalLeads = await Lead.countDocuments(baseMatch);

    /* ===============================
       LEADS BY STAGE
    =============================== */

    const stageAggregation = await Lead.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: "$stage",
          count: { $sum: 1 },
        },
      },
    ]);

    const leadsByStage: any = {};
    stageAggregation.forEach((item) => {
      leadsByStage[item._id] = item.count;
    });

    /* ===============================
       LEADS BY AGENT
    =============================== */

    const leadsByAgent = await Lead.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: "$assignedTo",
          total: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$_id",
          name: "$user.email",
          total: 1,
        },
      },
    ]);

    /* ===============================
       CONVERSION RATE
    =============================== */

    const closedCount = await Lead.countDocuments({
      ...baseMatch,
      stage: "CLOSED",
    });

    const conversionRate =
      totalLeads === 0 ? 0 : (closedCount / totalLeads) * 100;

    return {
      totalLeads,
      leadsByStage,
      leadsByAgent,
      conversionRate,
    };
  }
}

export default new DashboardService();