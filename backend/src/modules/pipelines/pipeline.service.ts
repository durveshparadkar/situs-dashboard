import Pipeline from "./pipeline.model.js";
import mongoose from "mongoose";

/* ======================================================
   🚀 CREATE PIPELINE
====================================================== */
export const createPipeline = async (data: {
  name: string;
  isDefault: boolean;
  organizationId: mongoose.Types.ObjectId | string;
  stages: {
    name: string;
    order: number;
    probability: number;
    isClosed?: boolean;
    isWon?: boolean;
    isLost?: boolean;
    color?: string;
  }[];
}) => {
  // 🔥 Ensure only one won & one lost stage
  const wonStages = data.stages.filter((s) => s.isWon);
  const lostStages = data.stages.filter((s) => s.isLost);

  if (wonStages.length > 1) {
    throw new Error("Only one stage can be marked as Won");
  }

  if (lostStages.length > 1) {
    throw new Error("Only one stage can be marked as Lost");
  }

  // 🔥 Normalize stages
  const normalizedStages = data.stages.map((stage) => {
    const isClosed = stage.isClosed || stage.isWon || stage.isLost || false;

    return {
      name: stage.name,
      order: stage.order,
      probability: stage.probability,
      color: stage.color || "#3B82F6",
      isClosed,
      isWon: stage.isWon || false,
      isLost: stage.isLost || false,
    };
  });

  const pipeline = await Pipeline.create({
    ...data,
    stages: normalizedStages,
  });

  return pipeline;
};

/* ======================================================
   🔎 GET DEFAULT PIPELINE (PER ORGANIZATION)
====================================================== */
export const getDefaultPipeline = async (
  organizationId: mongoose.Types.ObjectId | string
) => {
  return await Pipeline.findOne({
    organizationId,
    isDefault: true,
  });
};

/* ======================================================
   🔥 UNSET DEFAULT PIPELINE (ENSURE SINGLE DEFAULT)
====================================================== */
export const unsetDefaultPipeline = async (
  organizationId: mongoose.Types.ObjectId | string
) => {
  await Pipeline.updateMany(
    { organizationId, isDefault: true },
    { $set: { isDefault: false } }
  );
};

/* ======================================================
   📋 GET ALL PIPELINES (ORG SCOPED)
====================================================== */
export const getPipelinesByOrganization = async (
  organizationId: mongoose.Types.ObjectId | string
) => {
  return await Pipeline.find({ organizationId }).sort({ createdAt: -1 });
};