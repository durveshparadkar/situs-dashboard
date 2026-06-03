import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";
import AuditLog, {
  AuditAction,
  AuditResource,
  AuditOutcome,
  AuditSeverity,
  AuditActorType,
} from "./audit.model.js";
import logger from "../../utils/logger.js";

const router: Router = Router();

/* ================= HELPERS ================= */

/**
 * Read the authenticated user off req.user (globally augmented in express.d.ts).
 * Throws if missing — protect middleware should always populate it.
 */
function getUser(req: Request): {
  userId: string;
  organizationId: string;
  role: string;
} {
  const u = req.user;
  if (!u) throw new Error("Unauthorized — req.user missing");

  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? u._id.toString() : "");

  const organizationId =
    typeof u.organizationId === "string"
      ? u.organizationId
      : String(u.organizationId ?? "");

  return {
    userId,
    organizationId,
    role: String(u.role ?? "USER").toUpperCase(),
  };
}

/* ================= LOCAL MIDDLEWARE ================= */

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const validateObjectId = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.params[paramName] as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: `Invalid ${paramName} format` },
      });
      return;
    }
    next();
  };
};

const rateLimit = (_opts: { windowMs: number; max: number }) =>
  (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };

const READ_LIMIT = rateLimit({ windowMs: 60_000, max: 60 });

/* ================= QUERY HELPERS ================= */

function buildAuditQuery(
  req: Request,
  organizationId: string
): Record<string, unknown> {
  const query: Record<string, unknown> = { organizationId };

  if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId as string)) {
    query.userId = req.query.userId as string;
  }

  if (req.query.resource) {
    const resource = req.query.resource as string;
    if (Object.values(AuditResource).includes(resource as AuditResource)) {
      query.resource = resource;
    }
  }

  if (req.query.resourceId && mongoose.Types.ObjectId.isValid(req.query.resourceId as string)) {
    query.resourceId = req.query.resourceId as string;
  }

  if (req.query.action) {
    const action = req.query.action as string;
    if (Object.values(AuditAction).includes(action as AuditAction)) {
      query.action = action;
    }
  }

  if (req.query.outcome) {
    const outcome = req.query.outcome as string;
    if (["success", "failure", "denied"].includes(outcome)) {
      query.outcome = outcome as AuditOutcome;
    }
  }

  if (req.query.severity) {
    const severity = req.query.severity as string;
    if (["info", "warn", "critical"].includes(severity)) {
      query.severity = severity as AuditSeverity;
    }
  }

  if (req.query.actorType) {
    const actorType = req.query.actorType as string;
    if (["user", "system", "ai", "integration", "api", "cron"].includes(actorType)) {
      query.actorType = actorType as AuditActorType;
    }
  }

  if (req.query.from || req.query.to) {
    const dateRange: Record<string, Date> = {};
    if (req.query.from) {
      const from = new Date(req.query.from as string);
      if (!isNaN(from.getTime())) dateRange.$gte = from;
    }
    if (req.query.to) {
      const to = new Date(req.query.to as string);
      if (!isNaN(to.getTime())) dateRange.$lte = to;
    }
    if (Object.keys(dateRange).length) query.createdAt = dateRange;
  }

  return query;
}

/* ================= GLOBAL MIDDLEWARE ================= */

router.use(protect);

/* ================= ROUTES ================= */

/* GET /audit */
router.get(
  "/",
  READ_LIMIT,
  authorize("READ_ORG"),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = getUser(req);

    const page  = Math.max(parseInt((req.query.page  as string) ?? "1",  10), 1);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? "50", 10), 1), 200);
    const skip  = (page - 1) * limit;
    const sortOrder: 1 | -1 = req.query.sortOrder === "asc" ? 1 : -1;

    const query = buildAuditQuery(req, organizationId);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email avatar")
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  })
);

/* GET /audit/critical */
router.get(
  "/critical",
  READ_LIMIT,
  authorize("READ_ORG"),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = getUser(req);

    const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);
    const since = req.query.since
      ? new Date(req.query.since as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(since.getTime())) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_DATE", message: "Invalid 'since' date" },
      });
      return;
    }

    const logs = await (AuditLog as unknown as {
      findCriticalEvents: (orgId: string, since: Date) => Promise<unknown[]>;
    }).findCriticalEvents(organizationId, since);

    res.status(200).json({
      success: true,
      data: logs.slice(0, limit),
      meta: { since, count: logs.length },
    });
  })
);

/* GET /audit/stats */
router.get(
  "/stats",
  READ_LIMIT,
  authorize("READ_ORG"),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = getUser(req);

    const since = req.query.since
      ? new Date(req.query.since as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const match = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      createdAt: { $gte: since },
    };

    const [overview, byAction, bySeverity, byOutcome, byActorType, topActors] =
      await Promise.all([
        AuditLog.countDocuments(match),
        AuditLog.aggregate([
          { $match: match },
          { $group: { _id: "$action", count: { $sum: 1 } } },
          { $project: { _id: 0, action: "$_id", count: 1 } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]),
        AuditLog.aggregate([
          { $match: match },
          { $group: { _id: "$severity", count: { $sum: 1 } } },
          { $project: { _id: 0, severity: "$_id", count: 1 } },
        ]),
        AuditLog.aggregate([
          { $match: match },
          { $group: { _id: "$outcome", count: { $sum: 1 } } },
          { $project: { _id: 0, outcome: "$_id", count: 1 } },
        ]),
        AuditLog.aggregate([
          { $match: match },
          { $group: { _id: "$actorType", count: { $sum: 1 } } },
          { $project: { _id: 0, actorType: "$_id", count: 1 } },
        ]),
        AuditLog.aggregate([
          { $match: { ...match, actorType: "user", userId: { $ne: null } } },
          { $group: { _id: "$userId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              userId: { $toString: "$_id" },
              count: 1,
              name:  "$user.name",
              email: "$user.email",
            },
          },
        ]),
      ]);

    res.status(200).json({
      success: true,
      data: { totalEvents: overview, byAction, bySeverity, byOutcome, byActorType, topActors, windowSince: since },
    });
  })
);

/* GET /audit/resource/:resource/:resourceId */
router.get(
  "/resource/:resource/:resourceId",
  READ_LIMIT,
  authorize("READ_ORG"),
  validateObjectId("resourceId"),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = getUser(req);
    const { resource, resourceId } = req.params;

    if (!Object.values(AuditResource).includes(resource as AuditResource)) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_RESOURCE", message: "Unknown resource type" },
      });
      return;
    }

    const limit = Math.min(parseInt((req.query.limit as string) ?? "200", 10), 500);

    const logs = await AuditLog.find({
      organizationId,
      resource,
      resourceId,
    } as Record<string, unknown>)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "name email avatar")
      .lean();

    res.status(200).json({
      success: true,
      data: logs,
      meta: { resource, resourceId, count: logs.length },
    });
  })
);

/* GET /audit/user/:userId */
router.get(
  "/user/:userId",
  READ_LIMIT,
  authorize("READ_ORG"),
  validateObjectId("userId"),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = getUser(req);
    const { userId } = req.params;

    const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);

    const logs = await AuditLog.find({
      organizationId,
      userId,
    } as Record<string, unknown>)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      data: logs,
      meta: { userId, count: logs.length },
    });
  })
);

/* GET /audit/export */
router.get(
  "/export",
  rateLimit({ windowMs: 60_000, max: 5 }),
  authorize("READ_ORG"),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId, userId } = getUser(req);

    const query = buildAuditQuery(req, organizationId);

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-export-${Date.now()}.ndjson"`
    );

    const cursor = AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(50_000)
      .cursor();

    let count = 0;
    for await (const doc of cursor) {
      res.write(JSON.stringify(doc) + "\n");
      count++;
    }
    res.end();

    const log = logger as unknown as {
      info?: (data: Record<string, unknown>, msg: string) => void;
    };
    if (typeof log.info === "function") {
      log.info({ organizationId, userId, count }, "Audit export delivered");
    }
  })
);

/* GET /audit/:id */
router.get(
  "/:id",
  READ_LIMIT,
  authorize("READ_ORG"),
  validateObjectId("id"),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = getUser(req);
    const { id } = req.params;

    const log = await AuditLog.findOne({
      _id: id,
      organizationId,
    } as Record<string, unknown>)
      .populate("userId", "name email avatar")
      .lean();

    if (!log) {
      res.status(404).json({
        success: false,
        error: { code: "AUDIT_NOT_FOUND", message: "Audit log not found" },
      });
      return;
    }

    res.status(200).json({ success: true, data: log });
  })
);

export default router;

