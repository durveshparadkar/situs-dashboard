import { Request, Response, NextFunction } from "express";
import Role from "./role.model.js";
import User from "../../modules/auth/auth.model.js";

export const checkPermission = (permissionName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await User.findById(userId).populate({
        path: "role",
        populate: { path: "permissions" },
      });

      if (!user || !user.role) {
        return res.status(403).json({ message: "No role assigned" });
      }

      const permissions = (user.role as any).permissions.map(
        (p: any) => p.name
      );

      if (!permissions.includes(permissionName)) {
        return res.status(403).json({ message: "Permission denied" });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
