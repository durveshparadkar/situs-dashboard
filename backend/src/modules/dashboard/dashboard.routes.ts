import { Router } from "express";
import { getDashboardSummary } from "./dashboard.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get("/summary", protect, getDashboardSummary);

export default router;