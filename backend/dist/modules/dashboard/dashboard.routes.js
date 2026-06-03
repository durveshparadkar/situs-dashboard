import { Router } from "express";
import { getDashboardSummary } from "./dashboard.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";
import { cache } from "../../shared/cache/cache.middleware.js";
import { apiLimiter } from "../../shared/middlewares/rateLimit.middleware.js";
/* ======================================================
   🚀 DASHBOARD ROUTES
====================================================== */
const router = Router();
/* ======================================================
   📊 SUMMARY (CACHED + PROTECTED)
====================================================== */
/**
 * Per-user cache key. Uses the globally-augmented req.user
 * (see express.d.ts) — no as any cast required.
 * Stringifies _id because it may be a Mongo ObjectId.
 */
const summaryCache = cache((req) => {
    const user = req.user;
    const id = (typeof user?.id === "string" && user.id) ||
        (user?._id ? String(user._id) : "unknown");
    return "dashboard:summary:" + id;
}, { ttl: 30 } // cache for 30 seconds
);
router.get("/summary", protect, apiLimiter, // prevent abuse
summaryCache, getDashboardSummary);
/* ======================================================
   🔮 FUTURE ROUTES (READY)
====================================================== */
// router.get("/pipeline-health", ...);
// router.get("/revenue", ...);
// router.get("/risk", ...);
// router.get("/alerts", ...);
export default router;
//# sourceMappingURL=dashboard.routes.js.map