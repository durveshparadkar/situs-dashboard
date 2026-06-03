// pipeline.routes.ts
import express, {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import mongoose from "mongoose";

import pipelineController from "./pipeline.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";
import { dbLogger } from "../../utils/logger.js";

const router: Router = express.Router();

/* =====================================================
   MIDDLEWARE STUBS
   Replace with shared imports when ready:

     import { authorize }        from "../../shared/middlewares/rbac.middleware.js";
     import { rateLimit }        from "../../shared/middlewares/rateLimit.middleware.js";
     import { validateObjectId } from "../../shared/middlewares/validateObjectId.js";
     import { asyncHandler }     from "../../utils/asyncHandler.js";
===================================================== */

/**
 * Async wrapper — forwards rejections to global error middleware.
 */
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

/**
 * MongoDB ObjectId param validator — rejects malformed IDs at the route layer
 * before they hit the controller or DB.
 */
const validateObjectId = (paramName: string): RequestHandler =>
  (req, res, next) => {
    const id = req.params[paramName] as string | undefined;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: {
          code:    "INVALID_ID",
          message: `Invalid ${paramName} format`,
        },
      });
      return;
    }
    next();
  };

/**
 * Rate limit stub — replace with express-rate-limit or Redis-backed limiter.
 * Keeps the route file compiling out-of-the-box.
 */
const rateLimit =
  (_opts: { windowMs: number; max: number }): RequestHandler =>
  (_req, _res, next) => {
    next();
  };

/* =====================================================
   ROLE GATE — MANAGER+ FOR MUTATIONS
   Defense in depth: controller also enforces this, but
   route-layer rejection is cheaper (no body parsing).
===================================================== */

const MANAGER_ROLES = ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"] as const;

const requireManager: RequestHandler = (req, res, next) => {
  const role = String(req.user?.role ?? "").toUpperCase();
  if (!(MANAGER_ROLES as readonly string[]).includes(role)) {
    dbLogger.warn(
      `Pipeline mutation denied: user=${req.user?.id ?? "anon"} role=${role}`
    );
    res.status(403).json({
      success: false,
      error: {
        code:    "FORBIDDEN",
        message: "Pipeline configuration requires manager-level access",
      },
    });
    return;
  }
  next();
};

/* =====================================================
   PROTECT MIDDLEWARE BRIDGE
   Imported protect() may have been authored with a narrower local AuthRequest
   interface. Cast to RequestHandler so Express's overload resolution accepts it.
===================================================== */

const protectMw = protect as unknown as RequestHandler;

/* =====================================================
   RATE LIMIT POLICIES
   Pipelines change rarely but reads are frequent (every kanban view).
   Tighter limits on writes, generous on reads.
===================================================== */

const READ_LIMIT       = rateLimit({ windowMs: 60_000, max: 120 }); // 120/min — kanban polling
const WRITE_LIMIT      = rateLimit({ windowMs: 60_000, max: 30  }); // 30/min — config updates
const CREATE_LIMIT     = rateLimit({ windowMs: 60_000, max: 10  }); // 10/min — creation is rare
const DUPLICATE_LIMIT  = rateLimit({ windowMs: 60_000, max: 5   }); // 5/min — discourage spam clones

/* =====================================================
   GLOBAL MIDDLEWARE
===================================================== */

/* Every pipeline route requires authentication */
router.use(protectMw);

/* =====================================================
   ROUTES
   IMPORTANT: more specific paths come BEFORE /:id-style routes.
   Express matches in declaration order — if "/" came before "/default",
   it would shadow it.
===================================================== */

/**
 * @route   GET /pipelines/default
 * @desc    Fetch the org's default pipeline
 * @access  Authenticated
 * @note    MUST be declared before "/:id" to avoid shadowing
 */
router.get(
  "/default",
  READ_LIMIT,
  pipelineController.getDefault
);

/**
 * @route   GET /pipelines
 * @desc    List org pipelines with pagination + search
 * @access  Authenticated
 * @query   page, limit, search
 */
router.get(
  "/",
  READ_LIMIT,
  pipelineController.getAll
);

/**
 * @route   POST /pipelines
 * @desc    Create a new pipeline with stages
 * @access  Manager+
 * @rateLimit 10/min
 */
router.post(
  "/",
  CREATE_LIMIT,
  requireManager,
  pipelineController.create
);

/**
 * @route   GET /pipelines/:id
 * @desc    Get a single pipeline by ID
 * @access  Authenticated
 */
router.get(
  "/:id",
  READ_LIMIT,
  validateObjectId("id"),
  pipelineController.getById
);

/**
 * @route   PATCH /pipelines/:id
 * @desc    Update a pipeline's name, stages, or default flag
 * @access  Manager+
 */
router.patch(
  "/:id",
  WRITE_LIMIT,
  requireManager,
  validateObjectId("id"),
  pipelineController.update
);

/**
 * @route   DELETE /pipelines/:id
 * @desc    Delete a pipeline (non-default only)
 * @access  Manager+
 */
router.delete(
  "/:id",
  WRITE_LIMIT,
  requireManager,
  validateObjectId("id"),
  pipelineController.remove
);

/**
 * @route   POST /pipelines/:id/set-default
 * @desc    Promote a pipeline to the org's default
 * @access  Manager+
 */
router.post(
  "/:id/set-default",
  WRITE_LIMIT,
  requireManager,
  validateObjectId("id"),
  pipelineController.setDefault
);

/**
 * @route   POST /pipelines/:id/duplicate
 * @desc    Clone an existing pipeline (optionally with a new name)
 * @access  Manager+
 * @body    { name?: string }
 * @rateLimit 5/min — clones are heavy and rarely needed in bursts
 */
router.post(
  "/:id/duplicate",
  DUPLICATE_LIMIT,
  requireManager,
  validateObjectId("id"),
  pipelineController.duplicate
);

export default router;