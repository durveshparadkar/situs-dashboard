import { Request, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import Invite from "./invite.model.js";
import User from "../users/user.model.js";
import { logAudit } from "../../shared/audits/audit.logger.js";
import { emailQueue } from "../../config/queue.js";

/* ===============================
   TYPES
================================ */

interface AuthRequest extends Request {
  user?: {
    _id: string;
    email: string;
    organizationId?: string;
  };
}

const INVITE_EXPIRY_HOURS = 24;

/* ===============================
   VALIDATION SCHEMAS
================================ */

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["AGENT", "USER"]).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(10),
});

const revokeInviteSchema = z.object({
  id: z.string().min(1),
});

/* ===============================
   CREATE INVITE
================================ */

export const createInvite = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user?._id || !user?.organizationId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { email, role } = createInviteSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    // Check existing active invite (not used + not expired)
    const existingInvite = await Invite.findOne({
      email: normalizedEmail,
      organizationId: user.organizationId,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (existingInvite) {
      return res.status(409).json({
        success: false,
        message: "Active invite already exists",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");

    const invite = await Invite.create({
      email: normalizedEmail,
      role: role ?? "AGENT",
      token,
      organizationId: user.organizationId,
      createdBy: user._id,
      expiresAt: new Date(
        Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000
      ),
      usedAt: null,
    });

    // Send email
    try {
      await emailQueue.add("send-invite", {
        to: normalizedEmail,
        subject: "You're invited to SITUS",
        body: `Join SITUS using this token: ${token}`,
      });
    } catch (err) {
      console.error("EMAIL QUEUE ERROR:", err);
    }

    await logAudit({
      organizationId: user.organizationId.toString(),
      actorId: user._id.toString(),
      action: "INVITE_CREATED",
      resource: "INVITE",
      resourceId: (invite._id as mongoose.Types.ObjectId).toString(),
      meta: { email: normalizedEmail },
      req,
    });

    return res.status(201).json({
      success: true,
      message: "Invite created",
      token, // return for testing
    });
  } catch (error) {
    console.error("CREATE INVITE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ===============================
   GET INVITES
================================ */

export const getInvites = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user?.organizationId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const invites = await Invite.find({
      organizationId: user.organizationId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: invites,
    });
  } catch (error) {
    console.error("GET INVITES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ===============================
   ACCEPT INVITE
================================ */

export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user?._id || !user?.email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { token } = acceptInviteSchema.parse(req.body);

    const invite = await Invite.findOne({ token });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invite not found",
      });
    }

    // Already used
    if (invite.usedAt) {
      return res.status(400).json({
        success: false,
        message: "Invite already used",
      });
    }

    // Expired
    if (invite.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Invite expired",
      });
    }

    // Wrong user
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: "Invite not issued for this email",
      });
    }

    // Attach user to org
    await User.findByIdAndUpdate(user._id, {
      organizationId: invite.organizationId,
      role: invite.role,
    });

    invite.usedAt = new Date();
    await invite.save();

    await logAudit({
      organizationId: invite.organizationId.toString(),
      actorId: user._id.toString(),
      action: "INVITE_ACCEPTED",
      resource: "INVITE",
      resourceId: invite._id.toString(),
      meta: { acceptedBy: user.email },
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Invite accepted successfully",
    });
  } catch (error) {
    console.error("ACCEPT INVITE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ===============================
   REVOKE INVITE
================================ */

export const revokeInvite = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user?.organizationId || !user?._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { id } = revokeInviteSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invite ID",
      });
    }

    const invite = await Invite.findOne({
      _id: id,
      organizationId: user.organizationId,
      usedAt: null,
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invite not found or already used",
      });
    }

    invite.usedAt = new Date(); // mark revoked as used
    await invite.save();

    await logAudit({
      organizationId: user.organizationId.toString(),
      actorId: user._id.toString(),
      action: "INVITE_REVOKED",
      resource: "INVITE",
      resourceId: invite._id.toString(),
      meta: { revokedEmail: invite.email },
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Invite revoked",
    });
  } catch (error) {
    console.error("REVOKE INVITE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};




