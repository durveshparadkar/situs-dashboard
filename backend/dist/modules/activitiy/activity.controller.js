import activityService from "./activity.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
/* =====================================================
   HELPERS
===================================================== */
function getOrganizationId(req) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
        throw ApiError.unauthorized("Unauthorized");
    }
    return organizationId.toString();
}
/* =====================================================
   CONTROLLER
===================================================== */
class ActivityController {
    /* =====================================================
       GET TIMELINE
    ===================================================== */
    getTimeline = asyncHandler(async (req, res) => {
        const typedReq = req;
        const organizationId = getOrganizationId(typedReq);
        const limit = Number(typedReq.query.limit) || 50;
        const timeline = await activityService.getTimeline(organizationId, limit);
        return res.status(200).json({
            success: true,
            data: timeline,
        });
    });
    /* =====================================================
       GET PROVIDER
    ===================================================== */
    getByProvider = asyncHandler(async (req, res) => {
        const typedReq = req;
        const organizationId = getOrganizationId(typedReq);
        const provider = String(typedReq.params.provider);
        const activities = await activityService.getByProvider(organizationId, provider);
        return res.status(200).json({
            success: true,
            data: activities,
        });
    });
    /* =====================================================
       RECENT RISKS
    ===================================================== */
    getRecentRisks = asyncHandler(async (req, res) => {
        const typedReq = req;
        const organizationId = getOrganizationId(typedReq);
        const risks = await activityService.getRecentRisks(organizationId);
        return res.status(200).json({
            success: true,
            data: risks,
        });
    });
    /* =====================================================
       SENTIMENT SUMMARY
    ===================================================== */
    getSentimentSummary = asyncHandler(async (req, res) => {
        const typedReq = req;
        const organizationId = getOrganizationId(typedReq);
        const summary = await activityService.getSentimentSummary(organizationId);
        return res.status(200).json({
            success: true,
            data: summary,
        });
    });
}
export default new ActivityController();
//# sourceMappingURL=activity.controller.js.map