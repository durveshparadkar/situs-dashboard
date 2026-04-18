import express from "express";
import DealController from "./deal.controller.js";

const router = express.Router();

router.post("/", (req, res) =>
  DealController.createDeal(req, res)
);

router.get("/", (req, res) =>
  DealController.getDeals(req, res)
);

router.patch("/:id", (req, res) =>
  DealController.updateDeal(req, res)
);

export default router;