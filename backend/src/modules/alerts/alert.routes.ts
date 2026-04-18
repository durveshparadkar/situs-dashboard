import express from "express";
import AlertController from "./alert.controller.js";

const router = express.Router();

/* ===============================
   ALERT ROUTES (ENTERPRISE READY)
=============================== */

/* 🔥 GET ALL ALERTS */
router.get("/", AlertController.getAlerts);

/* 🔥 GET UNREAD COUNT (🔥 UI BADGE) */
router.get("/unread-count", AlertController.getUnreadCount);

/* 🔥 MARK AS READ */
router.patch("/:id/read", AlertController.markAsRead);

/* 🔥 RESOLVE ALERT (🔥 IMPORTANT) */
router.patch("/:id/resolve", AlertController.resolveAlert);

/* 🔥 DELETE ALERT */
router.delete("/:id", AlertController.deleteAlert);

export default router;