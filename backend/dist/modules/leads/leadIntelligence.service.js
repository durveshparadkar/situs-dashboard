import { Types } from "mongoose";
import Lead from "./lead.model.js";
import User from "../users/user.model.js";
/* ================= HELPERS ================= */
function toObjectId(id) {
    if (!Types.ObjectId.isValid(id)) {
        throw new Error("Invalid ObjectId");
    }
    return new Types.ObjectId(id);
}
/* ======================================================
   🚀 LEAD INTELLIGENCE SERVICE (ENTERPRISE)
====================================================== */
class LeadIntelligenceService {
    /* ======================================================
       🔐 VISIBILITY FILTER
    ====================================================== */
    async buildVisibilityFilter(currentUser) {
        // SUPER_ADMIN → no restriction
        if (currentUser.role === "SUPER_ADMIN") {
            return {};
        }
        const orgId = toObjectId(currentUser.organizationId);
        const baseFilter = {
            organizationId: orgId,
        };
        // ORG_ADMIN → full org access
        if (currentUser.role === "ORG_ADMIN") {
            return baseFilter;
        }
        // AGENT → only own leads
        if (currentUser.role === "AGENT") {
            return {
                ...baseFilter,
                assignedTo: toObjectId(currentUser._id),
            };
        }
        // MANAGER → own + team
        if (currentUser.role === "MANAGER") {
            const teamMembers = await User.find({
                organizationId: orgId,
                managerId: toObjectId(currentUser._id),
            })
                .select("_id")
                .lean();
            const teamIds = teamMembers.map((u) => u._id);
            return {
                ...baseFilter,
                assignedTo: {
                    $in: [toObjectId(currentUser._id), ...teamIds],
                },
            };
        }
        return baseFilter;
    }
    /* ======================================================
       📊 OVERVIEW
    ====================================================== */
    async getOverview(currentUser) {
        const visibility = await this.buildVisibilityFilter(currentUser);
        const [totalLeads, critical, high, medium, low, stale, archived,] = await Promise.all([
            Lead.countDocuments(visibility),
            Lead.countDocuments({
                ...visibility,
                brainPriority: "critical",
                isArchived: false,
            }),
            Lead.countDocuments({
                ...visibility,
                brainPriority: "high",
                isArchived: false,
            }),
            Lead.countDocuments({
                ...visibility,
                brainPriority: "medium",
                isArchived: false,
            }),
            Lead.countDocuments({
                ...visibility,
                brainPriority: "low",
                isArchived: false,
            }),
            Lead.countDocuments({
                ...visibility,
                isStale: true,
                isArchived: false,
            }),
            Lead.countDocuments({
                ...visibility,
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
    /* ======================================================
       🔥 HIGH PRIORITY LEADS
    ====================================================== */
    async getHighPriorityLeads(currentUser) {
        const visibility = await this.buildVisibilityFilter(currentUser);
        return Lead.find({
            ...visibility,
            brainPriority: { $in: ["critical", "high"] },
            isArchived: false,
        })
            .sort({
            brainPriority: -1,
            leadScore: -1,
            lastActivityAt: 1,
        })
            .limit(50)
            .lean(); // 🚀 performance
    }
    /* ======================================================
       💤 STALE LEADS
    ====================================================== */
    async getStaleLeads(currentUser) {
        const visibility = await this.buildVisibilityFilter(currentUser);
        return Lead.find({
            ...visibility,
            isStale: true,
            isArchived: false,
        })
            .sort({
            lastActivityAt: 1,
            leadScore: -1,
        })
            .limit(50)
            .lean();
    }
    /* ======================================================
       👥 AGENT PERFORMANCE
    ====================================================== */
    async getAgentPerformance(currentUser) {
        if (!["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"].includes(currentUser.role)) {
            const err = new Error("Access denied");
            err.status = 403;
            throw err;
        }
        const orgId = toObjectId(currentUser.organizationId);
        const pipeline = [
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
        return Lead.aggregate(pipeline);
    }
}
export default new LeadIntelligenceService();
//# sourceMappingURL=leadIntelligence.service.js.map