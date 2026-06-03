import { Router } from "express";
import authController from "./auth.controller.js";
import { protect, } from "../../shared/middlewares/auth.middleware.js";
import { authLimiter } from "../../shared/security/authRateLimit.js";
import { loginRateLimit } from "../../shared/security/loginLimit.js";
import { cache } from "../../shared/cache/cache.middleware.js";
/* =====================================================
   ROUTER
===================================================== */
const router = Router();
/* =====================================================
   🔐 AUTH ROUTES
===================================================== */
/**
 * REGISTER
 */
router.post("/register", authLimiter, authController.register);
/**
 * LOGIN
 */
router.post("/login", loginRateLimit, authController.login);
/**
 * REFRESH TOKEN (🔥 IMPORTANT ADD)
 */
router.post("/refresh", authController.refresh);
/**
 * LOGOUT
 */
router.post("/logout", protect, authController.logout);
/* =====================================================
   🔒 PROTECTED ROUTES
===================================================== */
/**
 * PROFILE CACHE (per user)
 * Uses the globally-augmented req.user (express.d.ts), so we don't
 * need a separate AuthRequest type. Stringify _id since it can be
 * an ObjectId.
 */
const profileCache = cache((req) => {
    const user = req.user;
    const id = (typeof user?.id === "string" && user.id) ||
        (user?._id ? String(user._id) : "unknown");
    return "me:" + id;
}, { ttl: 30 });
/**
 * GET PROFILE
 */
router.get("/me", protect, profileCache, authController.getProfile);
export default router;
//# sourceMappingURL=auth.routes.js.map