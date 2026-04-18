import { Router } from "express";
import { createTeam, getTeams } from "./team.controller.js";

import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";
import { requireActiveBilling } from "../../shared/billing/billing.guard.js";
import { checkTeamLimit } from "../../shared/limits/limit.guard.js";

const router = Router();

/*
  Middleware order (VERY IMPORTANT):

  1️⃣ protect
  2️⃣ requireActiveBilling (only where needed)
  3️⃣ authorize
  4️⃣ limits
  5️⃣ controller
*/

// ===============================
// CREATE TEAM (Blocked if unpaid)
// ===============================
router.post(
  "/",
  protect,
  requireActiveBilling,      // 🔒 blocked if unpaid
  authorize("CREATE_TEAM"),
  checkTeamLimit,
  createTeam
);

// ===============================
// GET TEAMS (Allowed without billing check)
// ===============================
router.get(
  "/",
  protect,
  authorize("READ_TEAM"),
  getTeams                   // 👀 allowed
);

export default router;













