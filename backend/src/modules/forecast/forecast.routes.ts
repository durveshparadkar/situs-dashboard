import express from "express";
import ForecastController from "./forecast.controller.js";

const router = express.Router();

/* ===============================
   FORECAST ROUTES
=============================== */

// 🔒 Protected route
router.get("/", ForecastController.getForecast);

export default router;