import { Request, Response } from "express";
import dashboardService from "./dashboard.service.js";

export const getDashboardSummary = async (
  req: Request,
  res: Response
) => {
  const data = await dashboardService.getSummary(req.user);

  res.status(200).json({
    success: true,
    data,
  });
};