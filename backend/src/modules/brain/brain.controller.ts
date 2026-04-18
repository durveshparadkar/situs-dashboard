import { Request, Response } from "express";
import { analyzeLead } from "./brain.service.js";

export async function analyzeLeadController(
  req: Request,
  res: Response
) {
  try {
    const { leadId } = req.params;

    if (!leadId || Array.isArray(leadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leadId parameter",
      });
    }

    const decision = await analyzeLead(leadId);

    return res.json({
      success: true,
      data: decision,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
}