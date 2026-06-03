import mongoose from "mongoose";
import Lead from "../leads/lead.model.js";
import User from "../users/user.model.js";
import Deal from "../deals/deal.model.js";
import Alert from "../alerts/alert.model.js";
function toObjectId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid ObjectId");
    }
    return new mongoose.Types.ObjectId(id);
}
/* ======================================================
   🚀 DASHBOARD SERVICE (ELITE ANALYTICS)
====================================================== */
class DashboardService {
    async getSummary(currentUser) {
        const orgId = toObjectId(currentUser.organizationId);
        const userId = toObjectId(currentUser._id);
        const baseMatch = {
            organizationId: orgId,
            isArchived: false,
        };
        /* ======================================================
           🔐 ROLE VISIBILITY
        ====================================================== */
        if (currentUser.role === "AGENT") {
            baseMatch.assignedTo = userId;
        }
        if (currentUser.role === "MANAGER") {
            const teamMembers = await User.find({
                organizationId: orgId,
                managerId: userId,
            })
                .select("_id")
                .lean();
            const teamIds = teamMembers.map((u) => u._id);
            baseMatch.assignedTo = {
                $in: [userId, ...teamIds],
            };
        }
        /* ======================================================
           🚀 PARALLEL CORE QUERIES
        ====================================================== */
        const [totalLeads, stageAggregation, leadsByAgent, closedCount, 
        /* 💰 DEAL DATA */
        deals, 
        /* 🚨 ALERT DATA */
        alerts, 
        /* 📈 TREND DATA */
        recentLeads,] = await Promise.all([
            Lead.countDocuments(baseMatch),
            Lead.aggregate([
                { $match: baseMatch },
                {
                    $group: {
                        _id: "$stageId",
                        count: { $sum: 1 },
                    },
                },
            ]),
            Lead.aggregate([
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
                        name: "$user.name",
                        total: 1,
                    },
                },
            ]),
            Lead.countDocuments({
                ...baseMatch,
                probability: 100,
            }),
            /* 💰 DEALS */
            Deal.find({ organizationId: orgId }).lean(),
            /* 🚨 ALERTS */
            Alert.find({
                organizationId: orgId,
                status: "active",
            }).lean(),
            /* 📈 LAST 7 DAYS LEADS */
            Lead.countDocuments({
                ...baseMatch,
                createdAt: {
                    $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            }),
        ]);
        /* ======================================================
           📊 TRANSFORM STAGE DATA
        ====================================================== */
        const leadsByStage = {};
        stageAggregation.forEach((item) => {
            leadsByStage[String(item._id)] = item.count;
        });
        /* ======================================================
           📈 CONVERSION RATE
        ====================================================== */
        const conversionRate = totalLeads === 0
            ? 0
            : Number(((closedCount / totalLeads) * 100).toFixed(2));
        /* ======================================================
           💰 REVENUE ANALYTICS
        ====================================================== */
        let totalRevenue = 0;
        let expectedRevenue = 0;
        deals.forEach((deal) => {
            totalRevenue += deal.value || 0;
            expectedRevenue += (deal.value * deal.probability) / 100;
        });
        const riskDistribution = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
        };
        deals.forEach((deal) => {
            const level = deal.riskLevel;
            if (level in riskDistribution) {
                riskDistribution[level]++;
            }
        });
        /* ======================================================
           🚨 ALERT ANALYTICS
        ====================================================== */
        const alertSummary = {
            total: alerts.length,
            unread: alerts.filter((a) => !a.isRead).length,
            critical: alerts.filter((a) => a.severity === "high").length,
        };
        /* ======================================================
           ⚡ PIPELINE HEALTH SCORE
        ====================================================== */
        const avgProbability = deals.length === 0
            ? 0
            : deals.reduce((sum, d) => sum + d.probability, 0) /
                deals.length;
        const staleDeals = deals.filter((d) => (Date.now() - new Date(d.lastActivityAt).getTime()) /
            (1000 * 60 * 60 * 24) >
            7).length;
        const pipelineHealthScore = Math.max(0, Math.min(100, Math.round(avgProbability * 0.6 + (1 - staleDeals / (deals.length || 1)) * 40)));
        /* ======================================================
           🎯 INSIGHTS ENGINE
        ====================================================== */
        const insights = [];
        if (staleDeals > 3) {
            insights.push(`${staleDeals} deals are inactive >7 days`);
        }
        if (alertSummary.critical > 0) {
            insights.push(`${alertSummary.critical} critical alerts need attention`);
        }
        if (conversionRate < 20) {
            insights.push("Conversion rate is low");
        }
        if (expectedRevenue < totalRevenue * 0.5) {
            insights.push("Revenue risk is high");
        }
        /* ======================================================
           🚀 FINAL RESPONSE
        ====================================================== */
        return {
            /* CORE */
            totalLeads,
            leadsByStage,
            leadsByAgent,
            conversionRate,
            /* 💰 REVENUE */
            revenue: {
                total: totalRevenue,
                expected: Math.round(expectedRevenue),
            },
            /* 🧠 RISK */
            riskDistribution,
            /* 🚨 ALERTS */
            alerts: alertSummary,
            /* 📈 TRENDS */
            trends: {
                last7DaysLeads: recentLeads,
            },
            /* ⚡ HEALTH */
            pipelineHealthScore,
            /* 🎯 INSIGHTS */
            insights,
        };
    }
}
export default new DashboardService();
//# sourceMappingURL=dashboard.service.js.map