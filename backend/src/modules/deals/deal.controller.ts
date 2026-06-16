// deal.controller.ts
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

import DealService from "./deal.service.js";
import {
  validateCreateDeal,
  validateUpdateDeal,
} from "./deal.validation.js";
import logger from "../../utils/logger.js";

/* =====================================================
   ERRORS
===================================================== */

class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "APP_ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

/* =====================================================
   HTTP STATUS
===================================================== */

const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
} as const;

/* =====================================================
   CONFIG
===================================================== */

const DEAL_CONFIG = {
  pagination: {
    defaultPage: 1,
    defaultLimit: 20,
    maxLimit: 100,
  },
  search: {
    maxLength: 200,
  },
  import: {
    maxRows: 1000,
  },
} as const;

/* =====================================================
   ALLOWLISTS
===================================================== */

const VALID_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "value",
  "probability",
  "expectedCloseDate",
  "stage",
] as const;

const VALID_SORT_ORDERS = ["asc", "desc"] as const;

const VALID_STATUSES = ["open", "won", "lost"] as const;

/* =====================================================
   HELPERS
===================================================== */

interface DealUser {
  userId: string;
  organizationId: string;
  role: string;
}

/**
 * Extract the authenticated user. Reads from globally-augmented req.user
 * (express.d.ts) and normalizes _id to a string.
 */
function getUser(req: Request): DealUser {
  const u = req.user;
  if (!u) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
  }

  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? u._id.toString() : "");

  const organizationId =
    typeof u.organizationId === "string"
      ? u.organizationId
      : String(u.organizationId ?? "");

  if (!userId || !organizationId) {
    throw new AppError(
      "User missing identity or organization",
      HttpStatus.UNAUTHORIZED,
      "UNAUTHORIZED"
    );
  }

  return {
    userId,
    organizationId,
    role: String(u.role ?? "USER").toUpperCase(),
  };
}

/**
 * Validate and extract a Mongo ObjectId from req params.
 */
function getDealId(req: Request): string {
  const id = req.params.id as string | undefined;
  if (!id || !id.trim()) {
    throw new AppError("Deal ID required", HttpStatus.BAD_REQUEST, "MISSING_ID");
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(
      "Invalid Deal ID format",
      HttpStatus.BAD_REQUEST,
      "INVALID_ID"
    );
  }
  return id;
}

function paramAsString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function getNumber(
  value: unknown,
  fallback: number,
  opts: { min?: number; max?: number } = {}
): number {
  let n: number;
  if (typeof value === "string") {
    n = Number(value);
    if (!Number.isFinite(n)) n = fallback;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    n = value;
  } else {
    n = fallback;
  }
  if (opts.min !== undefined) n = Math.max(n, opts.min);
  if (opts.max !== undefined) n = Math.min(n, opts.max);
  return n;
}

function getEnumParam<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback?: T
): T | undefined {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function getDateParam(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? undefined : d;
}

function clampString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Logger calls — wrapped so we don't crash if logger is a plain function
 * vs an object with .info/.warn methods. Pino-style and console-style both work.
 */
const log = {
  info: (data: Record<string, unknown>, msg: string) => {
    const fn = (logger as unknown as { info?: (...args: unknown[]) => void })
      .info;
    if (typeof fn === "function") fn.call(logger, data, msg);
  },
  warn: (data: Record<string, unknown>, msg: string) => {
    const fn = (logger as unknown as { warn?: (...args: unknown[]) => void })
      .warn;
    if (typeof fn === "function") fn.call(logger, data, msg);
  },
};

/* =====================================================
   CONTROLLER
===================================================== */

class DealController {

  /* =====================================================
     POST /deals — create a new deal
  ===================================================== */
  async createDeal(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = getUser(req);

      log.info({ userId, organizationId }, "Deal creation initiated");

      validateCreateDeal(req.body);

      const deal = await DealService.createDeal(
        req.body,
        userId,
        organizationId
      );

      const dealId =
        (deal as { _id?: unknown })?._id !== undefined
          ? String((deal as { _id?: unknown })._id)
          : "unknown";

      log.info(
        { dealId, userId, organizationId },
        "Deal created successfully"
      );

      res.status(HttpStatus.CREATED).json({
        success: true,
        data: deal,
        message: "Deal created successfully",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /deals/import — bulk-create deals from parsed CSV rows
     The frontend parses the CSV in-browser and sends a rows array.
     Each row is validated individually; bad rows are skipped and
     reported back rather than failing the whole import.
  ===================================================== */
  async importDeals(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = getUser(req);

      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new AppError(
          "Request body must contain a non-empty 'rows' array",
          HttpStatus.BAD_REQUEST,
          "INVALID_PAYLOAD"
        );
      }
      if (rows.length > DEAL_CONFIG.import.maxRows) {
        throw new AppError(
          "Cannot import more than " +
            DEAL_CONFIG.import.maxRows +
            " deals at once",
          HttpStatus.BAD_REQUEST,
          "TOO_MANY_ROWS"
        );
      }

      log.info(
        { userId, organizationId, rowCount: rows.length },
        "Deal import initiated"
      );

      let importedCount = 0;
      const skipped: Array<{ row: number; reason: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = (rows[i] ?? {}) as Record<string, unknown>;
        const rowNum = i + 2; // header is row 1, data starts at row 2

        /* Title — required */
        const title =
          typeof row.title === "string" ? row.title.trim() : "";
        if (!title) {
          skipped.push({ row: rowNum, reason: "Missing title" });
          continue;
        }

        /* Value — required, numeric (strip commas/spaces) */
          const rawValue = row.value;
        const value =
          typeof rawValue === "number"
            ? rawValue
            : Number(
                String(rawValue ?? "")
                  .replace(/[₹$€£,\s]/g, "")
                  .replace(/rs\.?/gi, "")
              );
        if (!Number.isFinite(value) || value < 0) {
          skipped.push({ row: rowNum, reason: "Invalid value" });
          continue;
        }

        /* Probability — optional, 0-100 */
        let probability: number | undefined;
        if (row.probability !== undefined && row.probability !== "") {
          const p = Number(row.probability);
          if (Number.isFinite(p) && p >= 0 && p <= 100) {
            probability = p;
          }
        }

        /* Same payload createDeal accepts; backend resolves pipeline/stage */
        /* Same payload createDeal accepts; backend resolves pipeline/stage */
        const dealInput: { title: string; value: number; probability?: number } = {
          title,
          value,
        };
        if (probability !== undefined) dealInput.probability = probability;

        try {
          await DealService.createDeal(dealInput as never, userId, organizationId);
          importedCount++;
        } catch (err) {
          skipped.push({
            row: rowNum,
            reason: (err as Error)?.message ?? "Failed to create",
          });
        }
      }

      log.info(
        {
          userId,
          organizationId,
          imported: importedCount,
          skipped: skipped.length,
        },
        "Deal import complete"
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          imported: importedCount,
          skipped: skipped.length,
          skippedRows: skipped,
        },
        message:
          importedCount +
          " deals imported, " +
          skipped.length +
          " skipped",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /deals — paginated, filtered list
  ===================================================== */
  async getDeals(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = getUser(req);

      /* Pagination */
      const page = getNumber(req.query.page, DEAL_CONFIG.pagination.defaultPage, {
        min: 1,
        max: 10_000,
      });
      const limit = getNumber(
        req.query.limit,
        DEAL_CONFIG.pagination.defaultLimit,
        { min: 1, max: DEAL_CONFIG.pagination.maxLimit }
      );

      /* Filters */
      const search = clampString(req.query.search, DEAL_CONFIG.search.maxLength);
      const stage = paramAsString(req.query.stage);
      const status = getEnumParam(req.query.status, VALID_STATUSES);
      const ownerId = paramAsString(req.query.ownerId);
      const minValue =
        req.query.minValue !== undefined
          ? getNumber(req.query.minValue, 0, { min: 0 })
          : undefined;
      const maxValue =
        req.query.maxValue !== undefined
          ? getNumber(req.query.maxValue, 0, { min: 0 })
          : undefined;
      const createdAfter = getDateParam(req.query.createdAfter);
      const createdBefore = getDateParam(req.query.createdBefore);

      /* Sort */
      const sortBy =
        getEnumParam(req.query.sortBy, VALID_SORT_FIELDS, "createdAt") ??
        "createdAt";
      const sortOrder =
        getEnumParam(req.query.sortOrder, VALID_SORT_ORDERS, "desc") ?? "desc";

      log.info(
        { userId, organizationId, page, limit, sortBy },
        "Fetching deals"
      );

      /* Build filters object — service receives clean, validated input */
      const filters: Record<string, unknown> = {
        page,
        limit,
        sortBy,
        sortOrder,
        ...(search          && { search }),
        ...(stage           && { stage }),
        ...(status          && { status }),
        ...(ownerId         && { ownerId }),
        ...(minValue !== undefined && { minValue }),
        ...(maxValue !== undefined && { maxValue }),
        ...(createdAfter    && { createdAfter }),
        ...(createdBefore   && { createdBefore }),
      };

      const result = await DealService.getDeals(
        organizationId,
        filters as never
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: result.deals,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
          hasNext: result.page < result.totalPages,
          hasPrev: result.page > 1,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /deals/:id — single deal lookup
  ===================================================== */
  async getDealById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const dealId = getDealId(req);
      const { organizationId } = getUser(req);

      const deal = await DealService.getDealById(dealId, organizationId);

      if (!deal) {
        throw new AppError(
          "Deal not found",
          HttpStatus.NOT_FOUND,
          "DEAL_NOT_FOUND"
        );
      }

      res.status(HttpStatus.OK).json({
        success: true,
        data: deal,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     PATCH /deals/:id — partial update
  ===================================================== */
  async updateDeal(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const dealId = getDealId(req);
      const { userId, organizationId } = getUser(req);

      const body = req.body ?? {};
      if (typeof body !== "object" || Object.keys(body).length === 0) {
        throw new AppError(
          "No fields to update",
          HttpStatus.BAD_REQUEST,
          "EMPTY_UPDATE"
        );
      }

      log.info(
        { dealId, userId, fields: Object.keys(body) },
        "Deal update initiated"
      );

      validateUpdateDeal(body);

      const deal = await DealService.updateDeal(
        dealId,
        body,
        userId,
        organizationId
      );

      if (!deal) {
        throw new AppError(
          "Deal not found",
          HttpStatus.NOT_FOUND,
          "DEAL_NOT_FOUND"
        );
      }

      log.info({ dealId, userId }, "Deal updated successfully");

      res.status(HttpStatus.OK).json({
        success: true,
        data: deal,
        message: "Deal updated successfully",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     DELETE /deals/:id — soft delete
  ===================================================== */
  async deleteDeal(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const dealId = getDealId(req);
      const { userId, organizationId } = getUser(req);

      log.warn({ dealId, userId, organizationId }, "Deal deletion initiated");

      /* Try the dedicated softDeleteDeal method if the service exposes it,
         otherwise fall back to update with soft-delete fields. */
      const svc = DealService as unknown as {
        softDeleteDeal?: (
          dealId: string,
          userId: string,
          organizationId: string
        ) => Promise<unknown>;
      };

      let deal: unknown;
      if (typeof svc.softDeleteDeal === "function") {
        deal = await svc.softDeleteDeal(dealId, userId, organizationId);
      } else {
        deal = await DealService.updateDeal(
          dealId,
          {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: userId,
          } as never,
          userId,
          organizationId
        );
      }

      if (!deal) {
        throw new AppError(
          "Deal not found",
          HttpStatus.NOT_FOUND,
          "DEAL_NOT_FOUND"
        );
      }

      log.warn({ dealId, userId }, "Deal soft-deleted");

      res.status(HttpStatus.OK).json({
        success: true,
        message: "Deal deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /deals/:id/restore — undo soft delete
  ===================================================== */
  async restoreDeal(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const dealId = getDealId(req);
      const { userId, organizationId } = getUser(req);

      const svc = DealService as unknown as {
        restoreDeal?: (
          dealId: string,
          userId: string,
          organizationId: string
        ) => Promise<unknown>;
      };

      let deal: unknown;
      if (typeof svc.restoreDeal === "function") {
        deal = await svc.restoreDeal(dealId, userId, organizationId);
      } else {
        deal = await DealService.updateDeal(
          dealId,
          {
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
          } as never,
          userId,
          organizationId
        );
      }

      if (!deal) {
        throw new AppError(
          "Deal not found or not deleted",
          HttpStatus.NOT_FOUND,
          "DEAL_NOT_FOUND"
        );
      }

      log.info({ dealId, userId }, "Deal restored");

      res.status(HttpStatus.OK).json({
        success: true,
        data: deal,
        message: "Deal restored successfully",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     PATCH /deals/:id/stage — move deal to a different stage
  ===================================================== */
  async updateDealStage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const dealId = getDealId(req);
      const { userId, organizationId } = getUser(req);

      const stage = clampString(req.body?.stage, 100);
      if (!stage) {
        throw new AppError(
          "Stage is required",
          HttpStatus.BAD_REQUEST,
          "MISSING_STAGE"
        );
      }

      const reason = clampString(req.body?.reason, 500) || undefined;

      /* Use service's updateStage if available; fall back to updateDeal */
      const svc = DealService as unknown as {
        updateStage?: (
          dealId: string,
          stage: string,
          userId: string,
          organizationId: string,
          reason?: string
        ) => Promise<unknown>;
      };

      let deal: unknown;
      if (typeof svc.updateStage === "function") {
        deal = await svc.updateStage(
          dealId,
          stage,
          userId,
          organizationId,
          reason
        );
      } else {
        deal = await DealService.updateDeal(
          dealId,
          { stage } as never,
          userId,
          organizationId
        );
      }

      if (!deal) {
        throw new AppError(
          "Deal not found",
          HttpStatus.NOT_FOUND,
          "DEAL_NOT_FOUND"
        );
      }

      log.info(
        { dealId, stage, userId, reason: reason ?? "none" },
        "Deal stage updated"
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: deal,
        message: `Deal moved to ${stage}`,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /deals/stats — org-wide deal statistics
  ===================================================== */
  async getDealStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = getUser(req);

      const svc = DealService as unknown as {
        getDealStats?: (organizationId: string) => Promise<unknown>;
      };

      if (typeof svc.getDealStats !== "function") {
        throw new AppError(
          "Stats endpoint not available",
          HttpStatus.NOT_FOUND,
          "NOT_AVAILABLE"
        );
      }

      const stats = await svc.getDealStats(organizationId);

      log.info({ userId, organizationId }, "Deal stats fetched");

      res.status(HttpStatus.OK).json({
        success: true,
        data: stats,
        meta: { generatedAt: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /deals/bulk — bulk update stages (kanban drag-and-drop)
  ===================================================== */
  async bulkUpdateStage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = getUser(req);

      const updates = req.body?.updates;
      if (!Array.isArray(updates) || updates.length === 0) {
        throw new AppError(
          "Request body must contain a non-empty 'updates' array",
          HttpStatus.BAD_REQUEST,
          "INVALID_PAYLOAD"
        );
      }
      if (updates.length > 200) {
        throw new AppError(
          "Cannot update more than 200 deals at once",
          HttpStatus.BAD_REQUEST,
          "TOO_MANY_UPDATES"
        );
      }

      /* Validate every entry before any DB write */
      const validated = updates.map((u, idx) => {
        if (
          !u ||
          typeof u.dealId !== "string" ||
          !mongoose.Types.ObjectId.isValid(u.dealId) ||
          typeof u.stage !== "string" ||
          !u.stage.trim()
        ) {
          throw new AppError(
            `Invalid update at index ${idx}`,
            HttpStatus.BAD_REQUEST,
            "INVALID_UPDATE_ENTRY"
          );
        }
        return { dealId: u.dealId, stage: u.stage.trim().slice(0, 100) };
      });

      const svc = DealService as unknown as {
        bulkUpdateStage?: (
          updates: typeof validated,
          userId: string,
          organizationId: string
        ) => Promise<{ updated: number; failed: number }>;
      };

      let result: { updated: number; failed: number };
      if (typeof svc.bulkUpdateStage === "function") {
        result = await svc.bulkUpdateStage(validated, userId, organizationId);
      } else {
        /* Fallback: parallel single updates */
        const settled = await Promise.allSettled(
          validated.map((v) =>
            DealService.updateDeal(
              v.dealId,
              { stage: v.stage } as never,
              userId,
              organizationId
            )
          )
        );
        result = {
          updated: settled.filter((r) => r.status === "fulfilled").length,
          failed: settled.filter((r) => r.status === "rejected").length,
        };
      }

      log.info(
        { userId, organizationId, total: validated.length, ...result },
        "Bulk stage update complete"
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: result,
        message: `Bulk stage update: ${result.updated} updated, ${result.failed} failed`,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new DealController();