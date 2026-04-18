import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../../modules/users/user.model.js";
import {
  ROLE_PERMISSIONS,
  Permission,
  Role,
} from "../rbac/permissions.js";

interface JwtPayload {
  id: string;
}

/* ======================================================
   🔐 AUTH PROTECTION MIDDLEWARE
   - Verifies JWT
   - Attaches clean user object to req.user
   - Enforces multi-tenant isolation readiness
====================================================== */
export const protect = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // 🔥 Only attach necessary fields (security best practice)
    req.user = {
      _id: user._id,
      role: user.role,
      organizationId: user.organizationId,
      managerId: user.managerId ?? null,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

/* ======================================================
   🛡️ ROLE-BASED AUTHORIZATION
   - Checks if role has required permissions
====================================================== */
export const authorize =
  (...requiredPermissions: Permission[]) =>
  (req: any, res: Response, next: NextFunction) => {
    const role = req.user?.role as Role;

    if (!role || !ROLE_PERMISSIONS[role]) {
      return res.status(403).json({
        success: false,
        message: "Invalid role",
      });
    }

    const allowedPermissions = ROLE_PERMISSIONS[role];

    const hasPermission = requiredPermissions.every((permission) =>
      allowedPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };








































