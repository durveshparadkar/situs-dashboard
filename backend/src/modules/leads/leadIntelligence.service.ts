import mongoose from "mongoose";
import Lead from "./lead.model.js";
import User from "../users/user.model.js";

interface CurrentUser {
  _id: string;
  role: "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "AGENT" | "USER";
  organizationId: string;
  managerId?: string | null;
}

type LeadFilter = Record<string, unknown>;

class LeadIntelligenceService {
  /* =====================================================
     VISIBILITY FILTER (ALIGNED WITH UPPERCASE ROLES)
  ===================================================== */

  private async buildVisibilityFilter(
    currentUser: CurrentUser
  ): Promise<LeadFilter> {
    const orgId = new mongoose.Types.ObjectId(
      currentUser.organizationId
    );

    const baseFilter: LeadFilter = {
      organizationId: orgId,
    };

    // SUPER_ADMIN sees everything (platform-level)
    if (currentUser.role === "SUPER_ADMIN") {
      return {};
    }

    // ORG_ADMIN sees entire organization
    if (currentUser.role === "ORG_ADMIN") {
      return baseFilter;
    }

    // AGENT sees only assigned leads
    if (currentUser.role === "AGENT") {
      return {
        ...baseFilter,
        assignedTo: new mongoose.Types.ObjectId(currentUser._id),
      };
    }

    // MANAGER sees own + team
    if (currentUser.role === "MANAGER") {
      const teamMembers = await User.find({
        organizationId: orgId,
        managerId: new mongoose.Types.ObjectId(currentUser._id),
      })
        .select("_id")
        .lean();

      const teamIds = teamMembers.map((u) => u._id);

      return {
        ...baseFilter,
        assignedTo: {
          $in: [
            new mongoose.Types.ObjectId(currentUser._id),
            ...teamIds,
          ],
        },
      };
    }

    return baseFilter;
  }

  /* =====================================================
     INTELLIGENCE OVERVIEW
  ===================================================== */

  async getOverview(currentUser: CurrentUser) {
    const visibilityFilter =
      await this.buildVisibilityFilter(currentUser);

    const [
      totalLeads,
      critical,
      high,
      medium,
      low,
      stale,
      archived,
    ] = await Promise.all([
      Lead.countDocuments(visibilityFilter),

      Lead.countDocuments({
        ...visibilityFilter,
        brainPriority: "critical",
        isArchived: false,
      }),

      Lead.countDocuments({
        ...visibilityFilter,
        brainPriority: "high",
        isArchived: false,
      }),

      Lead.countDocuments({
        ...visibilityFilter,
        brainPriority: "medium",
        isArchived: false,
      }),

      Lead.countDocuments({
        ...visibilityFilter,
        brainPriority: "low",
        isArchived: false,
      }),

      Lead.countDocuments({
        ...visibilityFilter,
        isStale: true,
        isArchived: false,
      }),

      Lead.countDocuments({
        ...visibilityFilter,
        isArchived: true,
      }),
    ]);

    return {
      totalLeads,
      activeLeads: totalLeads - archived,
      archived,
      priorityBreakdown: {
        critical,
        high,
        medium,
        low,
      },
      staleLeads: stale,
    };
  }

  /* =====================================================
     HIGH PRIORITY LEADS
  ===================================================== */

  async getHighPriorityLeads(currentUser: CurrentUser) {
    const visibilityFilter =
      await this.buildVisibilityFilter(currentUser);

    return Lead.find({
      ...visibilityFilter,
      brainPriority: { $in: ["critical", "high"] },
      isArchived: false,
    })
      .sort({
        brainPriority: -1,
        leadScore: -1,
        lastActivityAt: 1,
      })
      .limit(50);
  }

  /* =====================================================
     STALE LEADS
  ===================================================== */

  async getStaleLeads(currentUser: CurrentUser) {
    const visibilityFilter =
      await this.buildVisibilityFilter(currentUser);

    return Lead.find({
      ...visibilityFilter,
      isStale: true,
      isArchived: false,
    })
      .sort({
        lastActivityAt: 1,
        leadScore: -1,
      })
      .limit(50);
  }

  /* =====================================================
     AGENT PERFORMANCE INTELLIGENCE
  ===================================================== */

  async getAgentPerformance(currentUser: CurrentUser) {
    if (
      currentUser.role !== "ORG_ADMIN" &&
      currentUser.role !== "MANAGER" &&
      currentUser.role !== "SUPER_ADMIN"
    ) {
      const err: any = new Error("Access denied");
      err.status = 403;
      throw err;
    }

    const orgId = new mongoose.Types.ObjectId(
      currentUser.organizationId
    );

    const pipeline: any[] = [
      {
        $match: {
          organizationId: orgId,
          isArchived: false,
        },
      },
      {
        $group: {
          _id: "$assignedTo",
          totalLeads: { $sum: 1 },
          criticalLeads: {
            $sum: {
              $cond: [{ $eq: ["$brainPriority", "critical"] }, 1, 0],
            },
          },
          highPriorityLeads: {
            $sum: {
              $cond: [{ $eq: ["$brainPriority", "high"] }, 1, 0],
            },
          },
          staleLeads: {
            $sum: {
              $cond: [{ $eq: ["$isStale", true] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "agent",
        },
      },
      { $unwind: "$agent" },
      {
        $project: {
          _id: 0,
          agentId: "$agent._id",
          agentName: "$agent.email",
          totalLeads: 1,
          criticalLeads: 1,
          highPriorityLeads: 1,
          staleLeads: 1,
        },
      },
      { $sort: { totalLeads: -1 } },
    ];

    return Lead.aggregate(pipeline as any[]);
  }
}

export default new LeadIntelligenceService();