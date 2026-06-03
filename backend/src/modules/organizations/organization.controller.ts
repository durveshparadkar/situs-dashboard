// organization.controller.ts
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { asyncHandler } from "../../utils/asyncHandler.js";
import OrganizationService from "./organization.service.js";
import type { UpdateOrgInput } from "./organization.service.js";
import Subscription from "../../shared/billing/subscription.model.js";
import User from "../users/user.model.js";
import { logAudit } from "../../shared/audits/audit.logger.js";
import {
  AuditAction,
  AuditResource,
} from "../audit/audit.model.js";
import { dbLogger } from "../../utils/logger.js";

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

class ValidationError extends AppError {
  constructor(details: Array<{ field: string; message: string }>) {
    super("Validation failed", 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

/* =====================================================
   HTTP STATUS
===================================================== */

const HttpStatus = {
  OK:           200,
  CREATED:      201,
  NO_CONTENT:   204,
  BAD_REQUEST:  400,
  UNAUTHORIZED: 401,
  FORBIDDEN:    403,
  NOT_FOUND:    404,
  CONFLICT:     409,
  INTERNAL:     500,
} as const;

/* =====================================================
   CONFIG
===================================================== */

const ORG_CONFIG = {
  pagination: {
    defaultLimit: 50,
    maxLimit: 200,
  },
  privilegedRoles: ["SUPER_ADMIN", "ORG_ADMIN"] as const,
  superAdminOnly:  ["SUPER_ADMIN"] as const,
} as const;

/* =====================================================
   ALLOWLISTS
===================================================== */

const VALID_PLANS = ["SMALL_BUSINESS", "PRO", "ENTERPRISE"] as const;
type Plan = (typeof VALID_PLANS)[number];

/* All roles in the system — used for general role checks (allows USER). */
const VALID_ROLES = [
  "SUPER_ADMIN",
  "ORG_ADMIN",
  "MANAGER",
  "AGENT",
  "USER",
] as const;
type Role = (typeof VALID_ROLES)[number];

/* The narrower set OrganizationService.CurrentUser accepts.
   USER is excluded because users without an org role can't perform
   org operations — the service-layer contract enforces this. */
const SERVICE_ROLES = [
  "SUPER_ADMIN",
  "ORG_ADMIN",
  "MANAGER",
  "AGENT",
] as const;
type ServiceRole = (typeof SERVICE_ROLES)[number];

/**
 * Normalize an actor's role to a ServiceRole, defaulting unrecognized roles
 * to AGENT (lowest privilege). The service-layer guards still enforce
 * role-based access — this just satisfies the type system at the boundary.
 */
function toServiceRole(role: string): ServiceRole {
  return (SERVICE_ROLES as readonly string[]).includes(role)
    ? (role as ServiceRole)
    : "AGENT";
}

/* =====================================================
   ZOD SCHEMAS
===================================================== */

const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    plan: z.enum(VALID_PLANS),
    timezone: z.string().trim().max(50).optional(),
    currency: z.string().trim().length(3, "Currency must be ISO 4217 (3 chars)").optional(),
  })
  .strict();

const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    settings: z
      .object({
        timezone:     z.string().trim().max(50).optional(),
        currency:     z.string().trim().length(3).optional(),
        locale:       z.string().trim().max(20).optional(),
        weekStartsOn: z.number().int().min(0).max(6).optional(),
      })
      .strict()
      .optional(),
    branding: z
      .object({
        logoUrl:      z.string().url().max(2000).optional(),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be hex color").optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

/* =====================================================
   HELPERS
===================================================== */

interface OrgActor {
  userId: string;
  organizationId: string;
  role: string;
}

/**
 * Extract & validate the authenticated user. Reads from globally-augmented
 * req.user (via express.d.ts) and normalizes _id to a string.
 */
function requireAuth(req: Request): OrgActor {
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

  if (!userId) {
    throw new AppError(
      "User missing identity",
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
 * Some endpoints (getCurrent, update, delete) require the user to be
 * attached to an org. Create flow does not.
 */
function requireOrg(
  actor: OrgActor
): asserts actor is OrgActor & { organizationId: string } {
  if (!actor.organizationId) {
    throw new AppError(
      "User is not attached to an organization",
      HttpStatus.BAD_REQUEST,
      "NO_ORGANIZATION"
    );
  }
}

function requireRole(actor: OrgActor, allowed: readonly string[]): void {
  if (!(allowed as readonly string[]).includes(actor.role)) {
    throw new AppError(
      "Forbidden — insufficient role",
      HttpStatus.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function runSchema<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((e) => ({
        field:   e.path.length ? e.path.join(".") : "(root)",
        message: e.message,
      }))
    );
  }
  return result.data;
}

/**
 * Build the service-input shape that OrganizationService methods expect.
 * Centralizes the (legacy) { _id, role, organizationId } field naming
 * in one place so we can migrate the service later without changing
 * every call site. Narrows role to ServiceRole (excludes USER) so
 * service signatures with strict role unions accept us.
 */
function buildServiceUser(actor: OrgActor): {
  _id: string;
  role: ServiceRole;
  organizationId: string;
} {
  return {
    _id:            actor.userId,
    role:           toServiceRole(actor.role),
    organizationId: actor.organizationId,
  };
}

/* =====================================================
   CONTROLLER
===================================================== */

class OrganizationController {

  /* =====================================================
     POST /organizations — create a new org and bootstrap subscription
  ===================================================== */
  create = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);

    /* A user already in an org cannot create another one — typical SaaS rule */
    if (actor.organizationId) {
      throw new AppError(
        "User is already attached to an organization",
        HttpStatus.CONFLICT,
        "ALREADY_IN_ORG"
      );
    }

    const validated = runSchema(createOrganizationSchema, req.body);
    const { name, plan } = validated;

    /* Transactional create — org, subscription, user-link must all succeed */
    const session = await mongoose.startSession();

    let createdOrg: { _id: mongoose.Types.ObjectId | string } | null = null;
    let createdSubscription: unknown = null;

    try {
      await session.withTransaction(async () => {
        /* ── 1. Create the org ── */
        const orgSvc = OrganizationService as unknown as {
          create: (
            input: { name: string; timezone?: string; currency?: string },
            opts?: { session?: mongoose.ClientSession }
          ) => Promise<{ _id: mongoose.Types.ObjectId | string }>;
        };

        const org = await orgSvc.create(
          {
            name,
            ...(validated.timezone && { timezone: validated.timezone }),
            ...(validated.currency && { currency: validated.currency }),
          },
          { session }
        );

        const orgIdStr =
          typeof org._id === "string" ? org._id : org._id.toString();

        /* ── 2. Create the subscription ── */
        const isEnterprise = plan === "ENTERPRISE";

        const subscription = await Subscription.create(
          [
            {
              organizationId:       org._id,
              stripeCustomerId:     "manual",
              stripeSubscriptionId: "manual",
              plan,
              status: isEnterprise ? "ACTIVE" : "TRIALING",
            },
          ],
          { session }
        );

        /* ── 3. Update org billing flag ── */
        const billingSvc = OrganizationService as unknown as {
          updateBilling: (
            orgId: string,
            status: "ACTIVE" | "TRIAL",
            actorOverride: {
              _id: string;
              role: ServiceRole;
              organizationId: string;
            },
            opts?: { session?: mongoose.ClientSession }
          ) => Promise<unknown>;
        };

        await billingSvc.updateBilling(
          orgIdStr,
          isEnterprise ? "ACTIVE" : "TRIAL",
          {
            _id:            actor.userId,
            role:           "SUPER_ADMIN" as ServiceRole,
            organizationId: orgIdStr,
          },
          { session }
        );

        /* ── 4. Promote the creator to ORG_ADMIN of the new org ── */
        await User.findByIdAndUpdate(
          actor.userId,
          {
            $set: {
              organizationId: org._id,
              role:           "ORG_ADMIN",
            },
          },
          { session }
        );

        createdOrg = org;
        createdSubscription = Array.isArray(subscription)
          ? subscription[0]
          : subscription;
      });

      if (!createdOrg) {
        throw new AppError(
          "Organization creation failed",
          HttpStatus.INTERNAL,
          "TRANSACTION_FAILED"
        );
      }
    } finally {
      await session.endSession();
    }

    const finalOrg = createdOrg as { _id: mongoose.Types.ObjectId | string };
    const finalOrgId =
      typeof finalOrg._id === "string" ? finalOrg._id : finalOrg._id.toString();

    /* Audit log — outside the transaction so a failed audit doesn't roll back */
    try {
      await logAudit({
        organizationId: finalOrgId,
        actorId:        actor.userId,
        action:         AuditAction.CREATE,
        resource:       AuditResource.ORGANIZATION,
        resourceId:     finalOrgId,
        meta:           { plan, name },
        req,
      } as never);
    } catch (err) {
      dbLogger.warn(
        `Audit log failed (non-fatal): org=${finalOrgId} ` +
        `error=\`${(err as Error)?.message ?? "unknown"}\``
      );
    }

    dbLogger.info(
      `Organization created: id=${finalOrgId} name=${name} ` +
      `plan=${plan} creator=${actor.userId}`
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: {
        organization: finalOrg,
        subscription: createdSubscription,
      },
      message: "Organization created",
    });
  });

  /* =====================================================
     GET /organizations/me — current org details
  ===================================================== */
  getCurrent = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireOrg(actor);

    const org = await OrganizationService.getCurrent(buildServiceUser(actor));

    if (!org) {
      throw new AppError(
        "Organization not found",
        HttpStatus.NOT_FOUND,
        "ORG_NOT_FOUND"
      );
    }

    res.status(HttpStatus.OK).json({
      success: true,
      data: org,
    });
  });

  /* =====================================================
     PATCH /organizations/me — update org settings/branding
  ===================================================== */
  update = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireOrg(actor);
    requireRole(actor, ORG_CONFIG.privilegedRoles);

    const validated = runSchema(updateOrganizationSchema, req.body);

    const updated = await OrganizationService.update(
      validated as UpdateOrgInput,
      buildServiceUser(actor)
    );

    if (!updated) {
      throw new AppError(
        "Organization not found",
        HttpStatus.NOT_FOUND,
        "ORG_NOT_FOUND"
      );
    }

    /* Audit log */
    try {
      await logAudit({
        organizationId: actor.organizationId,
        actorId:        actor.userId,
        action:         AuditAction.UPDATE,
        resource:       AuditResource.ORGANIZATION,
        resourceId:     actor.organizationId,
        meta:           { fields: Object.keys(validated) },
        req,
      } as never);
    } catch (err) {
      dbLogger.warn(
        `Audit log failed (non-fatal): org=${actor.organizationId} ` +
        `error=\`${(err as Error)?.message ?? "unknown"}\``
      );
    }

    dbLogger.info(
      `Organization updated: id=${actor.organizationId} ` +
      `actor=${actor.userId} fields=${Object.keys(validated).join(",")}`
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: updated,
      message: "Organization updated",
    });
  });

  /* =====================================================
     DELETE /organizations/me — soft delete (super admin only)
  ===================================================== */
  delete = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireOrg(actor);
    requireRole(actor, ORG_CONFIG.superAdminOnly);

    /* Require confirmation phrase in body — defends against accidental DELETE */
    const confirmation =
      typeof req.body?.confirmation === "string" ? req.body.confirmation : "";

    if (confirmation !== "DELETE_ORGANIZATION") {
      throw new AppError(
        "Confirmation required. Send { confirmation: 'DELETE_ORGANIZATION' } in body.",
        HttpStatus.BAD_REQUEST,
        "CONFIRMATION_REQUIRED"
      );
    }

    await OrganizationService.delete(buildServiceUser(actor));

    /* Audit log */
    try {
      await logAudit({
        organizationId: actor.organizationId,
        actorId:        actor.userId,
        action:         AuditAction.DELETE,
        resource:       AuditResource.ORGANIZATION,
        resourceId:     actor.organizationId,
        meta:           {},
        req,
      } as never);
    } catch (err) {
      dbLogger.warn(
        `Audit log failed (non-fatal): org=${actor.organizationId} ` +
        `error=\`${(err as Error)?.message ?? "unknown"}\``
      );
    }

    dbLogger.warn(
      `Organization deleted: id=${actor.organizationId} actor=${actor.userId}`
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Organization deleted",
    });
  });

  /* =====================================================
     GET /organizations — super-admin: list all orgs
  ===================================================== */
  listAll = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireRole(actor, ORG_CONFIG.superAdminOnly);

    const page = Math.max(
      parseInt(String(req.query.page ?? "1"), 10) || 1,
      1
    );
    const limit = Math.min(
      Math.max(
        parseInt(
          String(req.query.limit ?? String(ORG_CONFIG.pagination.defaultLimit)),
          10
        ) || ORG_CONFIG.pagination.defaultLimit,
        1
      ),
      ORG_CONFIG.pagination.maxLimit
    );

    /* Support optional service signature: (user, { page, limit }) — falls back
       to (user) if service doesn't accept pagination yet. */
    const svc = OrganizationService as unknown as {
      listAll: (
        user: { _id: string; role: ServiceRole; organizationId: string },
        opts?: { page?: number; limit?: number }
      ) => Promise<unknown>;
    };

    const data = await svc.listAll(buildServiceUser(actor), { page, limit });

    dbLogger.info(
      `Organization list (admin): actor=${actor.userId} ` +
      `page=${page} limit=${limit}`
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data,
      meta: {
        page,
        limit,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  /* =====================================================
     GET /organizations/me/stats — usage summary
  ===================================================== */
  getStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireOrg(actor);
    requireRole(actor, ORG_CONFIG.privilegedRoles);

    const svc = OrganizationService as unknown as {
      getStats?: (
        user: { _id: string; role: ServiceRole; organizationId: string }
      ) => Promise<unknown>;
    };

    if (typeof svc.getStats !== "function") {
      throw new AppError(
        "Stats endpoint not available",
        HttpStatus.NOT_FOUND,
        "NOT_AVAILABLE"
      );
    }

    const stats = await svc.getStats(buildServiceUser(actor));

    res.status(HttpStatus.OK).json({
      success: true,
      data: stats,
      meta: { generatedAt: new Date().toISOString() },
    });
  });

  /* =====================================================
     POST /organizations/me/transfer-ownership — handoff to another user
  ===================================================== */
  transferOwnership = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireOrg(actor);
    requireRole(actor, ORG_CONFIG.privilegedRoles);

    const newOwnerId =
      typeof req.body?.newOwnerId === "string" ? req.body.newOwnerId : "";

    if (!newOwnerId || !mongoose.Types.ObjectId.isValid(newOwnerId)) {
      throw new AppError(
        "Valid newOwnerId is required",
        HttpStatus.BAD_REQUEST,
        "INVALID_USER_ID"
      );
    }

    if (newOwnerId === actor.userId) {
      throw new AppError(
        "Cannot transfer ownership to yourself",
        HttpStatus.BAD_REQUEST,
        "INVALID_TRANSFER"
      );
    }

    /* Verify new owner is in the same org */
    const newOwner = await User.findOne({
      _id:            newOwnerId,
      organizationId: actor.organizationId,
    }).lean();

    if (!newOwner) {
      throw new AppError(
        "New owner must be a member of your organization",
        HttpStatus.BAD_REQUEST,
        "NOT_ORG_MEMBER"
      );
    }

    const svc = OrganizationService as unknown as {
      transferOwnership?: (opts: {
        organizationId: string;
        fromUserId: string;
        toUserId: string;
      }) => Promise<unknown>;
    };

    if (typeof svc.transferOwnership !== "function") {
      throw new AppError(
        "Ownership transfer not available",
        HttpStatus.NOT_FOUND,
        "NOT_AVAILABLE"
      );
    }

    const result = await svc.transferOwnership({
      organizationId: actor.organizationId,
      fromUserId:     actor.userId,
      toUserId:       newOwnerId,
    });

    /* Audit log — security-critical event */
    try {
      await logAudit({
        organizationId: actor.organizationId,
        actorId:        actor.userId,
        action:         AuditAction.UPDATE,
        resource:       AuditResource.ORGANIZATION,
        resourceId:     actor.organizationId,
        meta:           { event: "OWNERSHIP_TRANSFERRED", toUserId: newOwnerId },
        req,
      } as never);
    } catch (err) {
      dbLogger.warn(
        `Audit log failed (non-fatal): org=${actor.organizationId} ` +
        `error=\`${(err as Error)?.message ?? "unknown"}\``
      );
    }

    dbLogger.warn(
      `Org ownership transferred: org=${actor.organizationId} ` +
      `from=${actor.userId} to=${newOwnerId}`
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data:    result,
      message: "Ownership transferred",
    });
  });
}

export default new OrganizationController();












