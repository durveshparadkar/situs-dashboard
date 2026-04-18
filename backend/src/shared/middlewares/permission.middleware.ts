import { Request, Response, NextFunction } from "express";
import {
  ROLE_PERMISSIONS,
  Permission,
  Role,
} from "../rbac/permissions.js";

export const requirePermission =
  (...requiredPermissions: Permission[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user || !user.role) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Normalize role
    const role = user.role.toUpperCase() as Role;

    const allowedPermissions = ROLE_PERMISSIONS[role];

    if (!allowedPermissions) {
      return res.status(403).json({
        success: false,
        message: "Invalid role",
      });
    }

    // ✅ At least ONE permission must match
    const hasPermission = requiredPermissions.some((permission) =>
      allowedPermissions.includes(permission)
    );

    console.log("🔐 RBAC CHECK", {
      role,
      required: requiredPermissions,
      allowed: allowedPermissions,
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
        role,
        required: requiredPermissions,
        allowed: allowedPermissions,
      });
    }

    next();
  };
