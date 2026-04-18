import { Request, Response, NextFunction } from "express";

export const tenantGuard = (
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.organizationId) {
    return res.status(403).json({
      success: false,
      message: "Tenant access denied",
    });
  }

  req.organizationId = req.user.organizationId.toString();
  next();
};
