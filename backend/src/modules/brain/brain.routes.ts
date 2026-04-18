import { Router } from "express";
import { analyzeLeadController } from "./brain.controller.js";

const router = Router();

router.get("/analyze/:leadId", analyzeLeadController);

export default router;