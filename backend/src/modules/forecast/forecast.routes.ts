// forecast.routes.ts
import express, {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";

import ForecastController from "./forecast.controller.js";
import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";

const router: Router = express.Router();

/* =====================================================
   MIDDLEWARE
   These are local stubs that compile out-of-the-box.
   Replace with shared imports when ready:

     import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
     import { authorize  } from "../../shared/middlewares/rbac.middleware.js";
     import { rateLimit  } from "../../shared/middlewares/rateLimit.middleware.js";
     import { asyncHandler } from "../../utils/asyncHandler.js";
===================================================== */

/* Rate limiter — replace with express-rate-limit or Redis-backed limiter */
const rateLimit =
  (_opts: { windowMs: number; max: number }): RequestHandler =>
  (_req, _res, next) => {
    next();
  };

/* Async wrapper — eliminates try/catch boilerplate */
const asyncHandler =
  (
    fn: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/* =====================================================
   MANAGER-ONLY ROLE GUARD
   Some forecast endpoints (accuracy, refresh) expose sensitive data
   or trigger expensive recalculations — gate at the route layer.
===================================================== */

const MANAGER_ROLES = ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"] as const;

const requireManager: RequestHandler = (req, res, next) => {
  const role = String(req.user?.role ?? "").toUpperCase();
  if (!(MANAGER_ROLES as readonly string[]).includes(role)) {
    res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "This endpoint is restricted to managers",
      },
    });
    return;
  }
  next();
};

/* =====================================================
   RATE LIMIT POLICIES
   Forecast endpoints run heavy aggregations — tighter limits
   than typical reads. Different endpoints have different costs.
===================================================== */

const FORECAST_LIMIT  = rateLimit({ windowMs: 60_000, max: 30  }); // main forecast
const SUMMARY_LIMIT   = rateLimit({ windowMs: 60_000, max: 60  }); // lighter
const BREAKDOWN_LIMIT = rateLimit({ windowMs: 60_000, max: 30  }); // heavy aggregation
const ACCURACY_LIMIT  = rateLimit({ windowMs: 60_000, max: 20  }); // historical scan
const REFRESH_LIMIT   = rateLimit({ windowMs: 60_000, max: 3   }); // very expensive — strict

/* =====================================================
   GLOBAL MIDDLEWARE
   Every forecast route requires authentication.
===================================================== */

router.use(protect as RequestHandler);

/* =====================================================
   ROUTES
   IMPORTANT: more specific paths come BEFORE catch-alls.
   /summary, /breakdown, /accuracy must be declared before "/"
   so Express doesn't shadow them.
===================================================== */

/**
 * @route   GET /forecast/summary
 * @desc    High-level forecast summary for the dashboard
 * @access  Authenticated + READ_FORECAST
 */
router.get(
  "/summary",
  SUMMARY_LIMIT,
  authorize("READ_FORECAST"),
  asyncHandler((req, res, next) =>
    ForecastController.getForecastSummary(req, res, next)
  )
);

/**
 * @route   GET /forecast/breakdown
 * @desc    Forecast broken down by stage, owner, month, or week
 * @access  Authenticated + READ_FORECAST
 * @query   groupBy=stage|owner|month|week, range, ownerId
 */
router.get(
  "/breakdown",
  BREAKDOWN_LIMIT,
  authorize("READ_FORECAST"),
  asyncHandler((req, res, next) =>
    ForecastController.getForecastBreakdown(req, res, next)
  )
);

/**
 * @route   GET /forecast/accuracy
 * @desc    Historical forecast accuracy vs actuals (manager-only)
 * @access  Manager+ + READ_FORECAST_ACCURACY
 * @query   months (1-24, default 6)
 */
router.get(
  "/accuracy",
  ACCURACY_LIMIT,
  requireManager,
  authorize("READ_FORECAST"),
  asyncHandler((req, res, next) =>
    ForecastController.getForecastAccuracy(req, res, next)
  )
);

/**
 * @route   POST /forecast/refresh
 * @desc    Force recalculation, bypassing cache (manager-only, expensive)
 * @access  Manager+ + WRITE_FORECAST
 */
router.post(
  "/refresh",
  REFRESH_LIMIT,
  requireManager,
  authorize("MANAGE_FORECAST"),
  asyncHandler((req, res, next) =>
    ForecastController.refreshForecast(req, res, next)
  )
);

/**
 * @route   GET /forecast
 * @desc    Main forecast for the current org with filters
 * @access  Authenticated + READ_FORECAST
 * @query   range (week|month|quarter|year|custom), startDate, endDate,
 *          pipelineId, ownerId, model
 */
router.get(
  "/",
  FORECAST_LIMIT,
  authorize("READ_FORECAST"),
  asyncHandler((req, res, next) =>
    ForecastController.getForecast(req, res, next)
  )
);

export default router;
