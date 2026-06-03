// brain.controller.ts
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

import * as brainService from "./brain.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";

/* =====================================================
   CONFIG
===================================================== */

const BRAIN_CONFIG = {
  /* Hard caps to prevent abuse / runaway jobs */
  maxBatchSize: 100,                  // analyzeBatch payload cap
  maxAnalyzeTimeoutMs: 30_000,        // single-lead analysis timeout
  maxBatchTimeoutMs: 120_000,         // batch analysis timeout (2 min)

  /* Defaults */
  defaultExplainability: false,
  defaultIncludeSignals: true,

  /* Rate limit hints (read at app level via express-rate-limit) */
  rateLimitHints: {
    analyzeLeadPerMinute: 60,
    analyzeBatchPerMinute: 10,
  },
} as const;

/* =====================================================
   HELPERS
===================================================== */

/**
 * Get the authenticated user ID. Reads from the globally-augmented req.user.
 * Throws if missing.
 */
function getUserId(req: Request): string {
  const u = req.user;
  if (!u) {
    throw ApiError.unauthorized("Unauthorized");
  }

  const id =
    (typeof u.id === "string" && u.id) ||
    (u._id ? u._id.toString() : "");

  if (!id) {
    throw ApiError.unauthorized("User missing identity");
  }
  return id;
}

/**
 * Get the user's organization ID.
 */
function getOrgId(req: Request): string {
  const orgId = req.user?.organizationId;
  if (!orgId) {
    throw ApiError.unauthorized("User missing organization");
  }
  return typeof orgId === "string" ? orgId : String(orgId);
}

/**
 * Validate and extract a Mongo ObjectId from req params or body.
 */
function requireObjectId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw ApiError.badRequest(`${fieldName} is required`);
  }
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw ApiError.badRequest(`Invalid ${fieldName} format`);
  }
  return value;
}

/**
 * Parse a boolean-ish query param ("true", "1", true) safely.
 */
function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  return fallback;
}

/**
 * Coerce a service result (which may be void/undefined/object) to a safe shape.
 */
function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Race a promise against a timeout. Used to enforce hard caps on
 * service operations that could otherwise hang indefinitely.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
     const timeoutErr = new Error(
  `${operationName} timed out after ${timeoutMs}ms`
) as Error & { statusCode?: number; code?: string };
timeoutErr.statusCode = 504;
timeoutErr.code = "GATEWAY_TIMEOUT";
reject(timeoutErr);
    }, timeoutMs);
    timer.unref?.();

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/* =====================================================
   CONTROLLER
===================================================== */

class BrainController {

  /* =====================================================
     POST /brain/leads/:leadId/analyze
     Run the decision intelligence engine on a single lead.
  ===================================================== */
  analyzeLead = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);
      const organizationId = getOrgId(req);
      const leadId = requireObjectId(req.params.leadId, "leadId");

      /* Optional flags */
      const explainability = parseBool(
        req.query.explain,
        BRAIN_CONFIG.defaultExplainability
      );
      const includeSignals = parseBool(
        req.query.includeSignals,
        BRAIN_CONFIG.defaultIncludeSignals
      );

      dbLogger.info(
        `Brain analyze: lead=${leadId} user=${userId} org=${organizationId} ` +
        `explain=${explainability} signals=${includeSignals}`
      );

      const startedAt = Date.now();

      /* Service may be exported as a named function or via a service object —
         support both shapes without coupling the controller to a specific export. */
      const svc = brainService as unknown as {
        analyzeLead?: (
          leadId: string,
          opts?: {
            organizationId?: string;
            explainability?: boolean;
            includeSignals?: boolean;
            requestedBy?: string;
          }
        ) => Promise<unknown>;
      };

      if (typeof svc.analyzeLead !== "function") {
        throw ApiError.internal?.("Brain service unavailable") ??
          new Error("Brain service unavailable");
      }

      const decision = await withTimeout(
        Promise.resolve(
          svc.analyzeLead(leadId, {
            organizationId,
            explainability,
            includeSignals,
            requestedBy: userId,
          })
        ),
        BRAIN_CONFIG.maxAnalyzeTimeoutMs,
        "Brain analysis"
      );

      if (!decision) {
        throw ApiError.notFound(
          "Lead not found or could not be analyzed"
        );
      }

      const durationMs = Date.now() - startedAt;

      dbLogger.info(
        `Brain analyze complete: lead=${leadId} durationMs=${durationMs}`
      );

      /* Slow-analysis warning so ops can investigate */
      if (durationMs > 5_000) {
        dbLogger.warn(
          `Slow brain analysis: lead=${leadId} durationMs=${durationMs}`
        );
      }

      res.status(200).json({
        success: true,
        data: decision,
        meta: {
          leadId,
          analyzedAt: new Date().toISOString(),
          durationMs,
          requestedBy: userId,
          options: { explainability, includeSignals },
        },
      });
    },
    { name: "brain.analyzeLead", timeoutMs: BRAIN_CONFIG.maxAnalyzeTimeoutMs + 5_000 }
  );

  /* =====================================================
     POST /brain/leads/:leadId/refresh
     Force a re-analysis even if a cached decision exists.
  ===================================================== */
  refreshAnalysis = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);
      const organizationId = getOrgId(req);
      const leadId = requireObjectId(req.params.leadId, "leadId");

      const svc = brainService as unknown as {
        refreshAnalysis?: (
          leadId: string,
          opts: { organizationId: string; requestedBy: string; force: true }
        ) => Promise<unknown>;
        analyzeLead?: (
          leadId: string,
          opts?: { organizationId?: string; force?: boolean; requestedBy?: string }
        ) => Promise<unknown>;
      };

      const fn =
        typeof svc.refreshAnalysis === "function"
          ? () =>
              svc.refreshAnalysis!(leadId, {
                organizationId,
                requestedBy: userId,
                force: true,
              })
          : typeof svc.analyzeLead === "function"
          ? () =>
              svc.analyzeLead!(leadId, {
                organizationId,
                force: true,
                requestedBy: userId,
              })
          : null;

      if (!fn) {
        throw ApiError.notFound("Refresh not available");
      }

      dbLogger.info(
        `Brain refresh: lead=${leadId} user=${userId}`
      );

      const startedAt = Date.now();
      const decision = await withTimeout(
        Promise.resolve(fn()),
        BRAIN_CONFIG.maxAnalyzeTimeoutMs,
        "Brain refresh"
      );

      if (!decision) {
        throw ApiError.notFound("Lead not found");
      }

      const durationMs = Date.now() - startedAt;

      res.status(200).json({
        success: true,
        data: decision,
        meta: {
          leadId,
          refreshedAt: new Date().toISOString(),
          durationMs,
          requestedBy: userId,
        },
      });
    },
    { name: "brain.refreshAnalysis" }
  );

  /* =====================================================
     POST /brain/analyze-batch
     Bulk analyze multiple leads at once.
  ===================================================== */
  analyzeBatch = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);
      const organizationId = getOrgId(req);

      const leadIds = req.body?.leadIds;
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        throw ApiError.badRequest(
          "Request body must contain a non-empty 'leadIds' array"
        );
      }
      if (leadIds.length > BRAIN_CONFIG.maxBatchSize) {
        throw ApiError.badRequest(
          `Cannot analyze more than ${BRAIN_CONFIG.maxBatchSize} leads at once`
        );
      }

      /* Validate every ID before any work — fail-fast on bad input */
      const validatedIds = leadIds.map((id, idx) => {
        if (typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
          throw ApiError.badRequest(
            `Invalid leadId at index ${idx}`
          );
        }
        return id;
      });

      const svc = brainService as unknown as {
        analyzeBatch?: (
          leadIds: string[],
          opts: { organizationId: string; requestedBy: string }
        ) => Promise<unknown>;
        analyzeLead?: (
          leadId: string,
          opts?: { organizationId?: string; requestedBy?: string }
        ) => Promise<unknown>;
      };

      dbLogger.info(
        `Brain analyzeBatch: count=${validatedIds.length} user=${userId} org=${organizationId}`
      );

      const startedAt = Date.now();

      let result: unknown;
      if (typeof svc.analyzeBatch === "function") {
        /* Service supports native batch — preferred */
        result = await withTimeout(
          Promise.resolve(
            svc.analyzeBatch(validatedIds, {
              organizationId,
              requestedBy: userId,
            })
          ),
          BRAIN_CONFIG.maxBatchTimeoutMs,
          "Brain batch analysis"
        );
      } else if (typeof svc.analyzeLead === "function") {
        /* Fall back to parallel single-lead analyses with allSettled — partial
           failures don't break the entire batch */
        const settled = await Promise.allSettled(
          validatedIds.map((id) =>
            svc.analyzeLead!(id, { organizationId, requestedBy: userId })
          )
        );

        const successes = settled.filter(
          (r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled"
        );
        const failures = settled.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected"
        );

        result = {
          analyzed: successes.length,
          failed: failures.length,
          decisions: successes.map((r) => r.value),
          errors: failures.map((r, idx) => ({
            leadId: validatedIds[idx],
            error: (r.reason as Error)?.message ?? "Unknown error",
          })),
        };
      } else {
        throw ApiError.notFound("Brain batch analysis not available");
      }

      const durationMs = Date.now() - startedAt;

      dbLogger.info(
        `Brain analyzeBatch complete: count=${validatedIds.length} durationMs=${durationMs}`
      );

      res.status(200).json({
        success: true,
        data: result,
        meta: {
          totalRequested: validatedIds.length,
          analyzedAt: new Date().toISOString(),
          durationMs,
          requestedBy: userId,
        },
      });
    },
    {
      name: "brain.analyzeBatch",
      timeoutMs: BRAIN_CONFIG.maxBatchTimeoutMs + 5_000,
    }
  );

  /* =====================================================
     GET /brain/leads/:leadId/decision
     Fetch the most recent stored decision (no re-analysis).
  ===================================================== */
  getDecision = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);
      const organizationId = getOrgId(req);
      const leadId = requireObjectId(req.params.leadId, "leadId");

      const svc = brainService as unknown as {
        getDecision?: (
          leadId: string,
          opts: { organizationId: string }
        ) => Promise<unknown>;
        getLatestDecision?: (
          leadId: string,
          opts: { organizationId: string }
        ) => Promise<unknown>;
      };

      const fn =
        typeof svc.getDecision === "function"
          ? svc.getDecision
          : typeof svc.getLatestDecision === "function"
          ? svc.getLatestDecision
          : null;

      if (!fn) {
        throw ApiError.notFound("Decision lookup not available");
      }

      const decision = await fn(leadId, { organizationId });

      if (!decision) {
        throw ApiError.notFound("No decision found for this lead");
      }

      dbLogger.info(
        `Brain decision fetched: lead=${leadId} user=${userId}`
      );

      res.status(200).json({
        success: true,
        data: decision,
      });
    },
    { name: "brain.getDecision" }
  );

  /* =====================================================
     GET /brain/leads/:leadId/history
     Decision history for a lead (audit trail).
  ===================================================== */
  getDecisionHistory = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);
      const organizationId = getOrgId(req);
      const leadId = requireObjectId(req.params.leadId, "leadId");

      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1),
        100
      );

      const svc = brainService as unknown as {
        getDecisionHistory?: (
          leadId: string,
          opts: { organizationId: string; limit: number }
        ) => Promise<unknown[]>;
      };

      if (typeof svc.getDecisionHistory !== "function") {
        throw ApiError.notFound("Decision history not available");
      }

      const history = await svc.getDecisionHistory(leadId, {
        organizationId,
        limit,
      });

      dbLogger.info(
        `Brain history fetched: lead=${leadId} count=${
          Array.isArray(history) ? history.length : 0
        } user=${userId}`
      );

      res.status(200).json({
        success: true,
        data: history,
        meta: {
          leadId,
          count: Array.isArray(history) ? history.length : 0,
          limit,
        },
      });
    },
    { name: "brain.getDecisionHistory" }
  );

  /* =====================================================
     POST /brain/leads/:leadId/feedback
     Capture user feedback on a decision (for ML training).
  ===================================================== */
  submitFeedback = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);
      const organizationId = getOrgId(req);
      const leadId = requireObjectId(req.params.leadId, "leadId");

      const decisionId = requireObjectId(req.body?.decisionId, "decisionId");

      const rating = req.body?.rating;
      if (!["accurate", "inaccurate", "partially_accurate"].includes(rating)) {
        throw ApiError.badRequest(
          "rating must be one of: accurate, inaccurate, partially_accurate"
        );
      }

      const comment =
        typeof req.body?.comment === "string"
          ? req.body.comment.trim().slice(0, 2_000)
          : undefined;

      const svc = brainService as unknown as {
        submitFeedback?: (
          leadId: string,
          decisionId: string,
          feedback: {
            rating: string;
            comment?: string;
            organizationId: string;
            submittedBy: string;
          }
        ) => Promise<unknown>;
      };

      if (typeof svc.submitFeedback !== "function") {
        throw ApiError.notFound("Feedback submission not available");
      }

      const feedback = await svc.submitFeedback(leadId, decisionId, {
        rating,
        ...(comment !== undefined && { comment }),
        organizationId,
        submittedBy: userId,
      });

      dbLogger.info(
        `Brain feedback: lead=${leadId} decision=${decisionId} ` +
        `rating=${rating} user=${userId}`
      );

      res.status(201).json({
        success: true,
        data: feedback,
        message: "Feedback recorded. Thanks!",
      });
    },
    { name: "brain.submitFeedback" }
  );

  /* =====================================================
     GET /brain/health
     Health check — used by ops to verify the brain is operational.
  ===================================================== */
  health = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);

      const svc = brainService as unknown as {
        healthCheck?: () => Promise<unknown>;
      };

      const startedAt = Date.now();
      let isHealthy = true;
      let details: unknown = { status: "unknown" };

      if (typeof svc.healthCheck === "function") {
        try {
          details = asObject(await svc.healthCheck());
        } catch (err) {
          isHealthy = false;
          details = {
            status: "unhealthy",
            error: (err as Error)?.message ?? "Unknown error",
          };
        }
      } else {
        details = { status: "ok", note: "Service does not expose healthCheck" };
      }

      const durationMs = Date.now() - startedAt;

      dbLogger.info(
        `Brain health check: healthy=${isHealthy} durationMs=${durationMs} user=${userId}`
      );

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        data: details,
        meta: {
          checkedAt: new Date().toISOString(),
          durationMs,
        },
      });
    },
    { name: "brain.health" }
  );
}

/* =====================================================
   EXPORTS
===================================================== */

const brainController = new BrainController();
export default brainController;

/**
 * Backwards-compatible named export — preserves the original API
 * for any router that imports analyzeLeadController directly.
 */
export const analyzeLeadController = brainController.analyzeLead;