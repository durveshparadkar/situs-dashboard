import { Request, Response, NextFunction } from "express";
import * as pipelineService from "./pipeline.service.js";

export const create = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, isDefault, stages } = req.body;

    if (!name || !stages || !Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Pipeline name and stages are required",
      });
    }

    const organizationId = req.user.organizationId;

    // 🔥 Auto-generate stage order & probability
    const formattedStages = stages.map(
      (stage: any, index: number) => ({
        name: stage.name,
        order: index + 1,
        probability:
          stages.length === 1
            ? 100
            : Math.round((index / (stages.length - 1)) * 100),
      })
    );

    // 🔥 If setting as default → unset previous default
    if (isDefault) {
      await pipelineService.unsetDefaultPipeline(organizationId);
    }

    const pipeline = await pipelineService.createPipeline({
      name,
      isDefault: !!isDefault,
      organizationId,
      stages: formattedStages,
    });

    res.status(201).json({
      success: true,
      data: pipeline,
    });
  } catch (error) {
    next(error);
  }
};