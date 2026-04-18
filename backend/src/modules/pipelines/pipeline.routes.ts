import express from "express";
import * as pipelineController from "./pipeline.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, pipelineController.create);

export default router;