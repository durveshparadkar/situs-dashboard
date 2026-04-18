import express, { Request, Response } from "express";

import authRoutes from "./modules/auth/auth.routes.js";
import organizationRoutes from "./modules/organizations/organization.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import entityRoutes from "./modules/entities/entity.routes.js";
import teamRoutes from "./modules/teams/team.routes.js";
import inviteRoutes from "./modules/invites/invite.routes.js";
import leadRoutes from "./modules/leads/lead.routes.js"; // ✅ ADDED

import auditRoutes from "./shared/audits/audit.routes.js";
import auditModuleRoutes from "./modules/audit/audit.routes.js";

import billingRoutes from "./shared/billing/billing.routes.js";

const router = express.Router();

/* =======================================================
   ✅ SYSTEM ROUTES
======================================================= */

router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    status: "ok",
    service: "SITUS Backend",
    environment: process.env.NODE_ENV || "development",
    time: new Date().toISOString(),
  });
});

/* =======================================================
   ✅ MODULE ROUTES
======================================================= */

router.use("/auth", authRoutes);
router.use("/organizations", organizationRoutes);
router.use("/users", userRoutes);
router.use("/entities", entityRoutes);
router.use("/teams", teamRoutes);
router.use("/invites", inviteRoutes);
router.use("/leads", leadRoutes); // ✅ THIS FIXES YOUR 404

router.use("/audit", auditRoutes);
router.use("/audit", auditModuleRoutes);

router.use("/billing", billingRoutes);

/* =======================================================
   🚫 FALLBACK API 404
======================================================= */

router.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "API route not found: " + req.originalUrl,
  });
});

export default router;





















