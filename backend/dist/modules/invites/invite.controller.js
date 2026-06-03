import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import Invite from "./invite.model.js";
import User from "../users/user.model.js";
import { logAudit } from "../../shared/audits/audit.logger.js";
import { emailQueue } from "../../config/queue.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   ERRORS
===================================================== */
class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(message, statusCode = 400, code = "APP_ERROR", details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = "AppError";
    }
}
class ValidationError extends AppError {
    constructor(details) {
        super("Validation failed", 400, "VALIDATION_ERROR", details);
        this.name = "ValidationError";
    }
}
/* =====================================================
   CONFIG
===================================================== */
const CONFIG = {
    inviteExpiryHours: 24,
    tokenBytes: 32,
    maxInvitesPerOrgPerDay: 100,
    maxInvitesPerEmailPerDay: 3,
    pageDefault: 1,
    limitDefault: 50,
    limitMax: 200,
};
const HttpStatus = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL: 500,
};
/* =====================================================
   ZOD SCHEMAS
===================================================== */
const VALID_ROLES = ["AGENT", "USER", "MANAGER", "ADMIN"];
const createInviteSchema = z.object({
    email: z.string().email("Invalid email format").trim().toLowerCase(),
    role: z.enum(VALID_ROLES).optional().default("AGENT"),
    message: z.string().trim().max(500).optional(),
}).strict();
const acceptInviteSchema = z.object({
    token: z
        .string()
        .min(20, "Invalid token")
        .max(200, "Invalid token")
        .regex(/^[a-f0-9]+$/i, "Invalid token format"),
}).strict();
const listInvitesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(CONFIG.limitMax).optional().default(50),
    status: z.enum(["active", "used", "revoked", "expired", "all"]).optional().default("all"),
}).strict();
/**
 * Extract & validate the authenticated user from the globally-augmented
 * req.user. Handles both id and _id, normalizes to strings.
 */
function requireAuth(req) {
    const u = req.user;
    if (!u) {
        throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const userId = (typeof u.id === "string" && u.id) ||
        (u._id ? u._id.toString() : "");
    const organizationId = typeof u.organizationId === "string"
        ? u.organizationId
        : String(u.organizationId ?? "");
    const email = typeof u.email === "string" ? u.email : "";
    if (!userId || !organizationId) {
        throw new AppError("User missing identity or organization", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    return {
        userId,
        email,
        organizationId,
        role: String(u.role ?? "USER").toUpperCase(),
    };
}
function isValidObjectId(id) {
    if (!id)
        return false;
    return mongoose.Types.ObjectId.isValid(id);
}
function requireObjectId(req, paramName = "id") {
    const id = req.params[paramName];
    if (!id || !isValidObjectId(id)) {
        throw new AppError(`Invalid ${paramName}`, HttpStatus.BAD_REQUEST, "INVALID_ID");
    }
    return id;
}
function getRequestContext(req) {
    const xff = req.headers["x-forwarded-for"];
    const xffString = Array.isArray(xff) ? xff[0] : xff;
    return {
        ipAddress: (req.ip || (typeof xffString === "string" ? xffString : "") || "")
            .split(",")[0]
            ?.trim(),
        userAgent: req.get("user-agent") ?? undefined,
        source: "web",
        requestId: req.headers["x-request-id"] ?? undefined,
    };
}
function validate(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new ValidationError(result.error.issues.map((e) => ({
            field: e.path.length ? e.path.join(".") : "(root)",
            message: e.message,
        })));
    }
    return result.data;
}
/* ── Token helpers ── */
function generateToken() {
    const rawToken = crypto.randomBytes(CONFIG.tokenBytes).toString("hex");
    const tokenHash = Invite.hashToken(rawToken);
    const tokenLastFour = rawToken.slice(-4);
    return { rawToken, tokenHash, tokenLastFour };
}
async function enqueueInviteEmail(to, rawToken, options = {}) {
    try {
        await emailQueue.add("send-invite", {
            to,
            subject: "You're invited to SITUS",
            template: "invite",
            data: {
                token: rawToken,
                inviterEmail: options.inviterEmail,
                orgName: options.orgName,
                customMessage: options.message,
                expiresInHours: CONFIG.inviteExpiryHours,
            },
        }, {
            attempts: 5,
            backoff: { type: "exponential", delay: 5_000 },
        });
        return { enqueued: true };
    }
    catch (err) {
        dbLogger.error(`Invite email enqueue failed: to=${to} error=${err.message}`);
        return { enqueued: false };
    }
}
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
/* =====================================================
   RATE LIMITING
===================================================== */
async function checkInviteRateLimits(organizationId, email) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [orgCount, emailCount] = await Promise.all([
        Invite.countDocuments({ organizationId, createdAt: { $gte: oneDayAgo } }),
        Invite.countDocuments({ email, createdAt: { $gte: oneDayAgo } }),
    ]);
    if (orgCount >= CONFIG.maxInvitesPerOrgPerDay) {
        throw new AppError("Daily invite limit reached for your organization", HttpStatus.TOO_MANY_REQUESTS, "INVITE_RATE_LIMIT_ORG");
    }
    if (emailCount >= CONFIG.maxInvitesPerEmailPerDay) {
        throw new AppError("This email has been invited too many times today. Try again later.", HttpStatus.TOO_MANY_REQUESTS, "INVITE_RATE_LIMIT_EMAIL");
    }
}
/* =====================================================
   CREATE INVITE
===================================================== */
export const createInvite = asyncHandler(async (req, res) => {
    const { userId, email: actorEmail, organizationId } = requireAuth(req);
    const { email, role, message } = validate(createInviteSchema, req.body);
    /* Don't invite yourself */
    if (actorEmail && email === actorEmail.toLowerCase()) {
        throw new AppError("You cannot invite yourself", HttpStatus.BAD_REQUEST, "SELF_INVITE_NOT_ALLOWED");
    }
    /* Already a member? */
    const existingMember = await User.findOne({
        email,
        organizationId,
    }).lean();
    if (existingMember) {
        throw new AppError("This user is already a member of your organization", HttpStatus.CONFLICT, "USER_ALREADY_MEMBER");
    }
    await checkInviteRateLimits(organizationId, email);
    const existingInvite = await Invite.findActiveForEmail(email, organizationId);
    if (existingInvite) {
        throw new AppError("An active invite already exists for this email", HttpStatus.CONFLICT, "INVITE_ALREADY_EXISTS");
    }
    /* ── Generate token — store hash, send raw ── */
    const { rawToken, tokenHash, tokenLastFour } = generateToken();
    const reqCtx = getRequestContext(req);
    const invite = (await Invite.create({
        email,
        emailLower: email.toLowerCase(),
        role,
        tokenHash,
        tokenLastFour,
        organizationId,
        createdBy: userId,
        expiresAt: new Date(Date.now() + CONFIG.inviteExpiryHours * 60 * 60 * 1000),
        usedAt: null,
        revokedAt: null,
        resendCount: 0,
        ...(message !== undefined && { message }),
        createdFromIp: reqCtx.ipAddress ?? null,
        userAgent: reqCtx.userAgent ?? null,
    }));
    await logAudit({
        organizationId,
        userId,
        action: "INVITE_SENT",
        resource: "INVITE",
        resourceId: invite._id.toString(),
        after: { email, role, expiresAt: invite.expiresAt },
        requestContext: reqCtx,
    });
    const { enqueued } = await enqueueInviteEmail(email, rawToken, {
        inviterEmail: actorEmail,
        ...(message !== undefined && { message }),
    });
    dbLogger.info(`Invite created: org=${organizationId} email=${email} ` +
        `role=${role} actor=${userId} emailQueued=${enqueued}`);
    const isProduction = process.env.NODE_ENV === "production";
    res.status(HttpStatus.CREATED).json({
        success: true,
        message: enqueued
            ? "Invite created and email queued"
            : "Invite created (email delivery pending)",
        data: {
            id: invite._id,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt,
            tokenLastFour: invite.tokenLastFour,
            ...(!isProduction && { token: rawToken }),
        },
    });
});
/* =====================================================
   GET INVITES
===================================================== */
export const getInvites = asyncHandler(async (req, res) => {
    const { organizationId } = requireAuth(req);
    const { page, limit, status } = validate(listInvitesQuerySchema, req.query);
    const skip = (page - 1) * limit;
    const now = new Date();
    const baseQuery = { organizationId };
    switch (status) {
        case "active":
            Object.assign(baseQuery, {
                usedAt: null,
                revokedAt: null,
                expiresAt: { $gt: now },
            });
            break;
        case "used":
            baseQuery.usedAt = { $ne: null };
            break;
        case "revoked":
            baseQuery.revokedAt = { $ne: null };
            break;
        case "expired":
            Object.assign(baseQuery, {
                usedAt: null,
                revokedAt: null,
                expiresAt: { $lte: now },
            });
            break;
        case "all":
        default:
            break;
    }
    const [invites, total] = await Promise.all([
        Invite.find(baseQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("createdBy", "name email")
            .lean(),
        Invite.countDocuments(baseQuery),
    ]);
    const totalPages = Math.ceil(total / limit);
    res.status(HttpStatus.OK).json({
        success: true,
        data: invites,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
    });
});
/* =====================================================
   ACCEPT INVITE
===================================================== */
export const acceptInvite = asyncHandler(async (req, res) => {
    const { userId, email: userEmail } = requireAuth(req);
    if (!userEmail) {
        throw new AppError("User missing email — cannot accept invite", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const { token: rawToken } = validate(acceptInviteSchema, req.body);
    const session = await mongoose.startSession();
    try {
        let acceptedInvite = null;
        const reqCtx = getRequestContext(req);
        await session.withTransaction(async () => {
            /* ── Look up by token hash ── */
            const tokenHash = Invite.hashToken(rawToken);
            const invite = await Invite.findOne({ tokenHash }).session(session);
            if (!invite) {
                throw new AppError("Invite not found", HttpStatus.NOT_FOUND, "INVITE_NOT_FOUND");
            }
            if (invite.usedAt) {
                throw new AppError("Invite has already been accepted", HttpStatus.BAD_REQUEST, "INVITE_ALREADY_USED");
            }
            if (invite.revokedAt) {
                throw new AppError("Invite has been revoked", HttpStatus.BAD_REQUEST, "INVITE_REVOKED");
            }
            if (invite.expiresAt < new Date()) {
                throw new AppError("Invite has expired", HttpStatus.BAD_REQUEST, "INVITE_EXPIRED");
            }
            /* ── Constant-time email comparison ── */
            const inviteEmail = invite.email.toLowerCase().trim();
            const normalizedUserEmail = userEmail.toLowerCase().trim();
            const inviteBuf = Buffer.from(inviteEmail);
            const userBuf = Buffer.from(normalizedUserEmail);
            const emailMatches = inviteBuf.length === userBuf.length &&
                crypto.timingSafeEqual(inviteBuf, userBuf);
            if (!emailMatches) {
                throw new AppError("This invite was issued to a different email address", HttpStatus.FORBIDDEN, "INVITE_EMAIL_MISMATCH");
            }
            await User.findByIdAndUpdate(userId, { $set: { organizationId: invite.organizationId, role: invite.role } }, { session });
            invite.usedAt = new Date();
            invite.usedBy = userId;
            invite.acceptedFromIp = reqCtx.ipAddress ?? null;
            await invite.save({ session });
            acceptedInvite = invite;
        });
        if (!acceptedInvite) {
            throw new AppError("Transaction failed", HttpStatus.INTERNAL, "TRANSACTION_FAILED");
        }
        const finalized = acceptedInvite;
        await logAudit({
            organizationId: finalized.organizationId.toString(),
            userId,
            action: "INVITE_ACCEPTED",
            resource: "INVITE",
            resourceId: finalized._id.toString(),
            after: { acceptedBy: userEmail, role: finalized.role },
            requestContext: reqCtx,
        });
        dbLogger.info(`Invite accepted: invite=${finalized._id} ` +
            `user=${userId} org=${finalized.organizationId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            message: "Invite accepted successfully",
            data: {
                organizationId: finalized.organizationId,
                role: finalized.role,
            },
        });
    }
    finally {
        await session.endSession();
    }
});
/* =====================================================
   REVOKE INVITE
===================================================== */
export const revokeInvite = asyncHandler(async (req, res) => {
    const { userId, organizationId } = requireAuth(req);
    const id = requireObjectId(req, "id");
    const invite = await Invite.findOne({
        _id: id,
        organizationId,
    });
    if (!invite) {
        throw new AppError("Invite not found", HttpStatus.NOT_FOUND, "INVITE_NOT_FOUND");
    }
    if (invite.usedAt) {
        throw new AppError("Cannot revoke an invite that has already been accepted", HttpStatus.BAD_REQUEST, "INVITE_ALREADY_USED");
    }
    if (invite.revokedAt) {
        throw new AppError("Invite already revoked", HttpStatus.CONFLICT, "INVITE_ALREADY_REVOKED");
    }
    invite.revokedAt = new Date();
    invite.revokedBy = userId;
    await invite.save();
    await logAudit({
        organizationId,
        userId,
        action: "INVITE_REVOKED",
        resource: "INVITE",
        resourceId: invite._id.toString(),
        after: { revokedEmail: invite.email },
        requestContext: getRequestContext(req),
    });
    dbLogger.warn(`Invite revoked: invite=${invite._id} email=${invite.email} ` +
        `org=${organizationId} actor=${userId}`);
    res.status(HttpStatus.OK).json({
        success: true,
        message: "Invite revoked successfully",
    });
});
/* =====================================================
   RESEND INVITE
===================================================== */
export const resendInvite = asyncHandler(async (req, res) => {
    const { userId, email: actorEmail, organizationId } = requireAuth(req);
    const id = requireObjectId(req, "id");
    const invite = await Invite.findOne({
        _id: id,
        organizationId,
        usedAt: null,
        revokedAt: null,
    });
    if (!invite) {
        throw new AppError("Active invite not found", HttpStatus.NOT_FOUND, "INVITE_NOT_FOUND");
    }
    if (!invite.canResend()) {
        throw new AppError("Maximum resend limit reached for this invite", HttpStatus.TOO_MANY_REQUESTS, "RESEND_LIMIT_REACHED");
    }
    /* Always regenerate token on resend — old raw token is gone forever */
    const { rawToken, tokenHash, tokenLastFour } = generateToken();
    invite.tokenHash = tokenHash;
    invite.tokenLastFour = tokenLastFour;
    invite.resendCount = (invite.resendCount ?? 0) + 1;
    invite.lastResentAt = new Date();
    /* Extend expiry if already expired */
    if (invite.expiresAt < new Date()) {
        invite.expiresAt = new Date(Date.now() + CONFIG.inviteExpiryHours * 60 * 60 * 1000);
    }
    await invite.save();
    const { enqueued } = await enqueueInviteEmail(invite.email, rawToken, {
        inviterEmail: actorEmail,
    });
    await logAudit({
        organizationId,
        userId,
        action: "INVITE_SENT",
        resource: "INVITE",
        resourceId: invite._id.toString(),
        after: {
            resent: true,
            email: invite.email,
            resendCount: invite.resendCount,
        },
        requestContext: getRequestContext(req),
    });
    dbLogger.info(`Invite resent: invite=${invite._id} email=${invite.email} ` +
        `resendCount=${invite.resendCount} emailQueued=${enqueued}`);
    res.status(HttpStatus.OK).json({
        success: true,
        message: enqueued
            ? "Invite email resent"
            : "Invite updated; email delivery pending",
    });
});
//# sourceMappingURL=invite.controller.js.map