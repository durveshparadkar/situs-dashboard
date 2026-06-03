import { Router } from "express";
import rateLimit from "express-rate-limit";

import integrationController from "./integration.controller.js";

import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";

const router = Router();

/* =====================================================
   RATE LIMITS
   Reads are cheap; connect/disconnect trigger OAuth + external
   calls, so they get a tighter bucket.
===================================================== */

const READ_LIMIT = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const MUTATION_LIMIT = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

/* =====================================================
   GET ALL INTEGRATIONS
===================================================== */

router.get(
  "/",
  READ_LIMIT,
  protect,
  authorize("READ_INTEGRATIONS"),
  integrationController.findAll
);

/* =====================================================
   CONNECT PROVIDER
===================================================== */

router.post(
  "/:provider/connect",
  MUTATION_LIMIT,
  protect,
  authorize("MANAGE_INTEGRATIONS"),
  integrationController.connect
);

/* =====================================================
   DISCONNECT PROVIDER
===================================================== */

router.post(
  "/:provider/disconnect",
  MUTATION_LIMIT,
  protect,
  authorize("MANAGE_INTEGRATIONS"),
  integrationController.disconnect
);

export default router;