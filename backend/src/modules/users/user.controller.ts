import { Request, Response } from "express";
import { z } from "zod";
import User from "./user.model.js";

/* ===============================
   TYPES
================================ */

interface AuthRequest extends Request {
  user?: {
    _id: string;
    organizationId?: string;
    role?: string;
  };
}

/* ===============================
   VALIDATION SCHEMA
================================ */

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["SUPER_ADMIN", "ORG_ADMIN", "AGENT"]),
});

/* ===============================
   CREATE USER
================================ */

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const currentUser = req.user;

    if (!currentUser?.organizationId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Optional: Only ORG_ADMIN or SUPER_ADMIN can create users
    if (!["SUPER_ADMIN", "ORG_ADMIN"].includes(currentUser.role || "")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    const validated = createUserSchema.parse(req.body);

    const normalizedEmail = validated.email.toLowerCase().trim();

    const existing = await User.findOne({
      email: normalizedEmail,
      organizationId: currentUser.organizationId,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already exists in organization",
      });
    }

    const user = await User.create({
      name: validated.name,
      email: normalizedEmail,
      password: validated.password,
      role: validated.role,
      organizationId: currentUser.organizationId,
    });

    return res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error("CREATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
};

/* ===============================
   GET USERS
================================ */

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const currentUser = req.user;

    if (!currentUser?.organizationId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const users = await User.find({
      organizationId: currentUser.organizationId,
    }).select("-password");

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("GET USERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};












