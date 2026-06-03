// brain.routes.ts
import express, { Router, Request, Response, NextFunction, RequestHandler } from "express";
import mongoose from "mongoose";
import { analyzeLeadController } from "./brain.controller.js";

const router: Router = express.Router();

/* =====================================================
   MIDDLEWARE STUBS
   Replace with your real middleware once the imports are confirmed.
   They're written as no-op pass-throughs so this compiles today.
===================================================== */

/* Auth — verifies JWT, attaches req.user */
const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  // Hook up to your real auth middleware (e.g. shared/middlewares/auth.middleware.ts → protect)
  next();
};

/* RBAC — restricts to specific roles */
const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role;
    if (!userRole) return next();

    if (roles.length && !roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
    }
    next();
  };
};

/* Rate limiter — replace with express-rate-limit or your Redis-backed limiter */
const rateLimit = (_opts: { windowMs: number; max: number }) =>
  (_req: Request, _res: Response, next: NextFunction) => next();

/* Async wrapper — eliminates try/catch boilerplate */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/* MongoDB ObjectId param validator — rejects malformed IDs at the route layer */
const validateObjectId = (paramName: string): RequestHandler => {
  return (req, res, next) => {
    const id = req.params[paramName] as string | undefined;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ID",
          message: `Invalid ${paramName} format`,
        },
      });
      return;
    }
    next();
  };
};

/* =====================================================
   RATE LIMIT POLICIES
   Brain analysis is expensive (AI calls + DB hits).
   Tighter limits than typical reads.
===================================================== */

const ANALYSIS_LIMIT = rateLimit({ windowMs: 60_000, max: 30  }); // 30 analyses/min per user
const URGENT_LIMIT   = rateLimit({ windowMs: 60_000, max: 5   }); // 5 urgent triggers/min
const READ_LIMIT     = rateLimit({ windowMs: 60_000, max: 120 }); // 120 reads/min

/* =====================================================
   GLOBAL MIDDLEWARE
===================================================== */

router.use(requireAuth);

/* =====================================================
   ROUTES
===================================================== */

/**
 * @route   GET /brain/analyze/:leadId
 * @desc    Analyze a single lead — returns priority, signals, recommendations
 * @access  Authenticated
 */
router.get(
  "/analyze/:leadId",
  ANALYSIS_LIMIT,
  validateObjectId("leadId"),
  analyzeLeadController
);

/**
 * @route   POST /brain/analyze/:leadId
 * @desc    Force a fresh analysis (bypass cache)
 * @access  Authenticated
 * @note    POST variant for actions that mutate cached state
 */
router.post(
  "/analyze/:leadId",
  ANALYSIS_LIMIT,
  validateObjectId("leadId"),
  analyzeLeadController
);

export default router;