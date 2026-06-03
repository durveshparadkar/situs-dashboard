import mongoose from "mongoose";
import Pipeline, { IPipeline, IStage } from "./pipeline.model.js";

/* =====================================================
   TYPES
===================================================== */

interface CreatePipelineInput {
  name: string;
  isDefault?: boolean;
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
}

interface UpdatePipelineInput {
  name?: string;
  isDefault?: boolean;
  stages?: CreatePipelineInput["stages"];
}

/* =====================================================
   HELPERS
===================================================== */

function toObjectId(id: string | mongoose.Types.ObjectId) {
  if (id instanceof mongoose.Types.ObjectId) return id;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }

  return new mongoose.Types.ObjectId(id);
}

/* =====================================================
   NORMALIZE STAGES (SHARED)
===================================================== */

function normalizeStages(stages: CreatePipelineInput["stages"]) {
  if (!stages?.length) {
    throw new Error("Pipeline must have at least one stage");
  }

  // sort
  const sorted = [...stages].sort((a, b) => a.order - b.order);

  // validate order uniqueness
  const orderSet = new Set(sorted.map((s) => s.order));
  if (orderSet.size !== sorted.length) {
    throw new Error("Stage order must be unique");
  }

  let wonCount = 0;
  let lostCount = 0;

  const normalized = sorted.map((stage) => {
    const isWon = !!stage.isWon;
    const isLost = !!stage.isLost;
    const isClosed = stage.isClosed || isWon || isLost;

    if (isWon) wonCount++;
    if (isLost) lostCount++;

    return {
      name: stage.name?.trim() || "Stage",
      order: stage.order,
      probability: Math.min(100, Math.max(0, stage.probability)),
      color: stage.color || "#3B82F6",
      isClosed,
      isWon,
      isLost,
    };
  });

  if (wonCount > 1) throw new Error("Only one WON stage allowed");
  if (lostCount > 1) throw new Error("Only one LOST stage allowed");

  return normalized;
}

/* =====================================================
   🚀 CREATE PIPELINE (TRANSACTION SAFE)
===================================================== */

export const createPipeline = async (
  data: CreatePipelineInput
): Promise<IPipeline> => {
  const session = await mongoose.startSession();

  try {
    let created: IPipeline | null = null;

    await session.withTransaction(async () => {
      const orgId = toObjectId(data.organizationId);

      const stages = normalizeStages(data.stages);

      // ensure only 1 default
      if (data.isDefault) {
        await Pipeline.updateMany(
          { organizationId: orgId, isDefault: true },
          { $set: { isDefault: false } },
          { session }
        );
      }

      const docs = await Pipeline.create(
        [
          {
            name: data.name?.trim() || "Pipeline",
            organizationId: orgId,
            isDefault: !!data.isDefault,
            stages,
          },
        ],
        { session }
      );

      const doc = docs[0];
      if (!doc) throw new Error("Pipeline creation failed");

      created = doc;
    });

    if (!created) throw new Error("Pipeline creation failed");

    return created;
  } finally {
    session.endSession();
  }
};

/* =====================================================
   🔄 UPDATE PIPELINE (ENTERPRISE SAFE)
===================================================== */

export const updatePipeline = async (
  pipelineId: string,
  data: UpdatePipelineInput,
  organizationId: string
) => {
  const session = await mongoose.startSession();

  try {
    let updated;

    await session.withTransaction(async () => {
      const _id = toObjectId(pipelineId);
      const orgId = toObjectId(organizationId);

      const pipeline = await Pipeline.findOne({
        _id,
        organizationId: orgId,
      }).session(session);

      if (!pipeline) throw new Error("Pipeline not found");

      /* ================= UPDATE FIELDS ================= */

      if (data.name !== undefined) {
        pipeline.name = data.name.trim();
      }

      if (data.stages) {
        pipeline.stages = normalizeStages(data.stages) as IStage[];
      }

      if (data.isDefault) {
        await Pipeline.updateMany(
          {
            organizationId: orgId,
            _id: { $ne: _id },
          },
          { $set: { isDefault: false } },
          { session }
        );

        pipeline.isDefault = true;
      }

      await pipeline.save({ session });

      updated = pipeline;
    });

    return updated;
  } finally {
    session.endSession();
  }
};

/* =====================================================
   ❌ DELETE PIPELINE (SAFE)
===================================================== */

export const deletePipeline = async (
  pipelineId: string,
  organizationId: string
) => {
  const pipeline = await Pipeline.findOne({
    _id: toObjectId(pipelineId),
    organizationId: toObjectId(organizationId),
  });

  if (!pipeline) throw new Error("Pipeline not found");

  if (pipeline.isDefault) {
    throw new Error("Cannot delete default pipeline");
  }

  await Pipeline.deleteOne({ _id: pipeline._id });

  return { success: true };
};

/* =====================================================
   🔎 GET DEFAULT PIPELINE
===================================================== */

export const getDefaultPipeline = async (
  organizationId: string
) => {
  return Pipeline.findOne({
    organizationId: toObjectId(organizationId),
    isDefault: true,
  }).lean();
};

/* =====================================================
   📋 GET ALL PIPELINES (PAGINATED)
===================================================== */

export const getPipelinesByOrganization = async (
  organizationId: string,
  page = 1,
  limit = 10
) => {
  const orgId = toObjectId(organizationId);

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Pipeline.find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Pipeline.countDocuments({ organizationId: orgId }),
  ]);

  return {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};