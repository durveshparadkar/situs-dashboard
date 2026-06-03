import mongoose, { Types, SortOrder } from "mongoose";
import Deal, {
  DealDocument,
  DealStatus,
  DealPriority,
} from "./deal.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import DealRiskService from "./dealRisk.service.js";
import logger from "../../utils/logger.js";

/* ================= ERRORS ================= */

class ServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "SERVICE_ERROR"
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/* ================= TYPES ================= */

export interface CreateDealInput {
  title: string;
  value: number;
  currency?: string;
  pipelineId?: string;
  stageId?: string;
  probability?: number;
  lead?: string;
  accountId?: string;
  contactIds?: string[];
  description?: string;
  priority?: DealPriority;
  source?: string;
  expectedCloseDate?: Date | string;
  tags?: string[];
}

export interface UpdateDealInput {
  title?: string;
  value?: number;
  currency?: string;
  stageId?: string;
  pipelineId?: string;
  probability?: number;
  status?: DealStatus;
  priority?: DealPriority;
  description?: string;
  expectedCloseDate?: Date | string;
  tags?: string[];
  lostReason?: string;
  wonReason?: string;
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  stage?: string;
}

export interface DealFilters {
  page?: number;
  limit?: number;
  stage?: string;
  ownerId?: string;
  status?: DealStatus;
  priority?: DealPriority;
  riskLevel?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  minValue?: number;
  maxValue?: number;
  pipelineId?: string;
}

export interface PaginatedDeals {
  deals: DealDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DealStats {
  totalDeals: number;
  totalValue: number;
  weightedValue: number;
  byStage: Array<{ stageId: string; count: number; value: number }>;
  byStatus: Array<{ status: string; count: number; value: number }>;
  byRiskLevel: Array<{ riskLevel: string; count: number }>;
  averageDealSize: number;
  winRate: number;
}

/* ================= HELPERS ================= */

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function toObjectId(id: string): Types.ObjectId {
  if (!isValidObjectId(id)) {
    throw new ServiceError(`Invalid ObjectId: ${id}`, 400, "INVALID_ID");
  }
  return new mongoose.Types.ObjectId(id);
}

const SAFE_UPDATE_FIELDS = [
  "title",
  "value",
  "currency",
  "description",
  "priority",
  "status",
  "probability",
  "expectedCloseDate",
  "tags",
  "lostReason",
  "wonReason",
] as const;

const DEFAULT_PIPELINE_STAGES = [
  { name: "New", order: 0, probability: 10, color: "#3B82F6" },
  { name: "Qualified", order: 1, probability: 30, color: "#6366F1" },
  { name: "Proposal", order: 2, probability: 60, color: "#F59E0B" },
  { name: "Won", order: 3, probability: 100, color: "#10B981", isClosed: true, isWon: true },
  { name: "Lost", order: 4, probability: 0, color: "#EF4444", isClosed: true, isLost: true },
] as const;

async function findOrCreateDefaultPipeline(
  orgId: string,
  session: mongoose.ClientSession
) {
  const organizationId = toObjectId(orgId);

  const existingDefault = await Pipeline.findOne({
    organizationId,
    isDefault: true,
  }).session(session);

  if (existingDefault) return existingDefault;

  const firstExisting = await Pipeline.findOne({ organizationId })
    .sort({ createdAt: 1 })
    .session(session);

  if (firstExisting) {
    firstExisting.isDefault = true;
    await firstExisting.save({ session });
    return firstExisting;
  }

  const created = new Pipeline({
    name: "Sales Pipeline",
    organizationId,
    isDefault: true,
    stages: DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage })),
  });

  await created.save({ session });
  return created;
}

/* ================= SERVICE ================= */

class DealService {

  /* ── CREATE DEAL ── */
  async createDeal(
    data: CreateDealInput,
    userId: string,
    orgId: string
  ): Promise<DealDocument> {
    if (!data.title || data.value === undefined) {
      throw new ServiceError("Missing required fields", 400, "MISSING_FIELDS");
    }

    if (
      (data.pipelineId && !isValidObjectId(data.pipelineId)) ||
      (data.stageId && !isValidObjectId(data.stageId))
    ) {
      throw new ServiceError("Invalid pipeline or stage ID", 400, "INVALID_ID");
    }

    const session = await mongoose.startSession();
    let createdDeal: DealDocument | null = null;

    try {
      await session.withTransaction(async () => {
        let pipeline;

        if (data.pipelineId) {
          pipeline = await Pipeline.findOne({
            _id: data.pipelineId,
            organizationId: orgId,
          }).session(session);
        } else {
          pipeline = await findOrCreateDefaultPipeline(orgId, session);
        }

        if (!pipeline) {
          throw new ServiceError("Pipeline not found", 404, "PIPELINE_NOT_FOUND");
        }

        const stage = data.stageId
          ? pipeline.stages.find((s: any) => s._id.toString() === data.stageId)
          : [...pipeline.stages].sort((a: any, b: any) => a.order - b.order)[0];

        if (!stage) {
          throw new ServiceError("Invalid stage for this pipeline", 400, "INVALID_STAGE");
        }

        const dealData = {
          title:    data.title,
          value:    data.value,
          currency: data.currency ?? "INR",
          priority: data.priority ?? ("medium" as DealPriority),
          source:   data.source ?? "other",
          tags:     data.tags ?? [],
          expectedCloseDate: data.expectedCloseDate
            ? new Date(data.expectedCloseDate)
            : null,

          pipelineId:  pipeline._id,
          stageId:     stage._id,
          probability: data.probability ?? stage.probability ?? 0,

          lead:       data.lead      ? toObjectId(data.lead)      : null,
          accountId:  data.accountId ? toObjectId(data.accountId) : null,
          contactIds: (data.contactIds ?? []).map(toObjectId),

          organizationId: orgId,
          assignedTo:     userId,
          createdBy:      userId,
          lastUpdatedBy:  userId,

          status:        "open",
          activityCount: 0,
          lastActivityAt: new Date(),

          ...(data.description !== undefined && { description: data.description }),
        };

        const [deal] = await Deal.create([dealData], { session });

        createdDeal = deal as DealDocument;
      });

      if (!createdDeal) {
        throw new ServiceError("Deal creation failed", 500, "CREATE_FAILED");
      }

      const createdDealId = (createdDeal as DealDocument)._id.toString();
      void DealRiskService.calculateRisk(createdDealId).catch((riskErr) => {
        logger.error(
          { dealId: createdDealId, error: (riskErr as Error).message },
          "Risk calculation failed post-create"
        );
      });

      return createdDeal;
    } finally {
      session.endSession();
    }
  }

  /* ── GET DEALS ── */
  async getDeals(
    orgId: string,
    filters: DealFilters = {}
  ): Promise<PaginatedDeals> {
    const page  = Math.max(filters.page  ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const skip  = (page - 1) * limit;

    const query: Record<string, unknown> = {
      organizationId: orgId,
      isDeleted: false,
    };

    if (filters.stage)      query.stageId    = toObjectId(filters.stage);
    if (filters.pipelineId) query.pipelineId = toObjectId(filters.pipelineId);
    if (filters.ownerId)    query.assignedTo = toObjectId(filters.ownerId);
    if (filters.status)     query.status     = filters.status;
    if (filters.priority)   query.priority   = filters.priority;
    if (filters.riskLevel)  query.riskLevel  = filters.riskLevel;

    if (filters.minValue !== undefined || filters.maxValue !== undefined) {
  const valueFilter: { $gte?: number; $lte?: number } = {};
  if (filters.minValue !== undefined) valueFilter.$gte = filters.minValue;
  if (filters.maxValue !== undefined) valueFilter.$lte = filters.maxValue;
  query.value = valueFilter;
}

    if (filters.search?.trim()) {
      query.$text = { $search: filters.search.trim() };
    }

    const sortField = filters.sortBy ?? "createdAt";
    const sortOrder: SortOrder = filters.sortOrder === "asc" ? 1 : -1;
    const sort: Record<string, SortOrder> = { [sortField]: sortOrder };

    const [deals, total] = await Promise.all([
      Deal.find(query).sort(sort).skip(skip).limit(limit).lean<DealDocument[]>(),
      Deal.countDocuments(query),
    ]);

    return { deals, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /* ── GET DEAL BY ID ── */
  async getDealById(
    dealId: string,
    orgId: string
  ): Promise<DealDocument | null> {
    if (!isValidObjectId(dealId)) {
      throw new ServiceError("Invalid deal ID", 400, "INVALID_ID");
    }

    return Deal.findOne({
      _id: dealId,
      organizationId: orgId,
      isDeleted: false,
    }).lean<DealDocument>();
  }

  /* ── UPDATE DEAL ── */
  async updateDeal(
    dealId: string,
    updates: UpdateDealInput,
    userId: string,
    orgId?: string
  ): Promise<DealDocument | null> {
    if (!isValidObjectId(dealId)) {
      throw new ServiceError("Invalid deal ID", 400, "INVALID_ID");
    }

   const query: Record<string, unknown> = { _id: dealId, isDeleted: false };
    if (orgId) query.organizationId = orgId;

    const deal = await Deal.findOne(query);
    if (!deal) {
      throw new ServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
    }

    const isAssignee     = deal.assignedTo.toString() === userId;
    const isCreator      = deal.createdBy.toString()  === userId;
    const isCollaborator = deal.collaborators?.some((c: any) => c.toString() === userId);

    if (!isAssignee && !isCreator && !isCollaborator) {
      throw new ServiceError("Unauthorized to update this deal", 403, "FORBIDDEN");
    }

    if (updates.pipelineId || updates.stageId) {
      const pipelineId = updates.pipelineId ?? deal.pipelineId.toString();

      if (!isValidObjectId(pipelineId)) {
        throw new ServiceError("Invalid pipeline ID", 400, "INVALID_ID");
      }

      const pipeline = await Pipeline.findOne({
        _id: pipelineId,
        organizationId: deal.organizationId,
      });

      if (!pipeline) {
        throw new ServiceError("Pipeline not found", 404, "PIPELINE_NOT_FOUND");
      }

      const stageIdToUse = updates.stageId ?? deal.stageId.toString();
      const stage = pipeline.stages.find(
        (s: any) => s._id.toString() === stageIdToUse
      );

      if (!stage) {
        throw new ServiceError("Invalid stage for this pipeline", 400, "INVALID_STAGE");
      }

      deal.pipelineId  = pipeline._id as Types.ObjectId;
      deal.stageId     = stage._id;
      deal.probability = stage.probability ?? deal.probability;
    }

    for (const field of SAFE_UPDATE_FIELDS) {
      if (updates[field] !== undefined) {
        (deal as any)[field] = updates[field];
      }
    }

    if (updates.isDeleted !== undefined) {
      deal.isDeleted = updates.isDeleted;
      deal.deletedAt = updates.deletedAt ?? new Date();
      deal.deletedBy = updates.deletedBy
        ? toObjectId(updates.deletedBy)
        : toObjectId(userId);
    }

    deal.activityCount  = (deal.activityCount ?? 0) + 1;
    deal.lastActivityAt = new Date();
    deal.lastUpdatedBy  = toObjectId(userId);

    await deal.save();

    void DealRiskService.calculateRisk(dealId).catch((riskErr) => {
      logger.error(
        { dealId, error: (riskErr as Error).message },
        "Risk calculation failed post-update"
      );
    });

    return deal;
  }

  /* ── UPDATE DEAL STAGE ── */
  async updateDealStage(
    dealId: string,
    stageId: string,
    userId: string,
    orgId: string
  ): Promise<DealDocument> {
    const deal = await this.updateDeal(dealId, { stageId }, userId, orgId);

    if (!deal) {
      throw new ServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
    }

    return deal;
  }

  /* ── SOFT DELETE ── */
  async softDeleteDeal(
    dealId: string,
    userId: string,
    orgId: string
  ): Promise<DealDocument> {
    if (!isValidObjectId(dealId)) {
      throw new ServiceError("Invalid deal ID", 400, "INVALID_ID");
    }

    const deal = await Deal.findOne({
      _id: dealId,
      organizationId: orgId,
      isDeleted: false,
    });

    if (!deal) {
      throw new ServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
    }

    deal.isDeleted     = true;
    deal.deletedAt     = new Date();
    deal.deletedBy     = toObjectId(userId);
    deal.lastUpdatedBy = toObjectId(userId);

    await deal.save();

    logger.warn({ dealId, userId, orgId }, "Deal soft-deleted");

    return deal;
  }

  /* ── RESTORE ── */
  async restoreDeal(
    dealId: string,
    userId: string,
    orgId: string
  ): Promise<DealDocument> {
    const deal = await Deal.findOne({
      _id: dealId,
      organizationId: orgId,
      isDeleted: true,
    });

    if (!deal) {
      throw new ServiceError("Deleted deal not found", 404, "DEAL_NOT_FOUND");
    }

    deal.isDeleted     = false;
    deal.deletedAt     = null;
    deal.deletedBy     = null;
    deal.lastUpdatedBy = toObjectId(userId);

    await deal.save();
    return deal;
  }

  /* ── STATS ── */
  async getDealStats(orgId: string): Promise<DealStats> {
    const matchOpen = {
      organizationId: new mongoose.Types.ObjectId(orgId),
      isDeleted: false,
    };

    const [overview, byStage, byStatus, byRiskLevel, winRateData] =
      await Promise.all([
        Deal.aggregate([
          { $match: matchOpen },
          {
            $group: {
              _id:           null,
              totalDeals:    { $sum: 1 },
              totalValue:    { $sum: "$value" },
              weightedValue: { $sum: "$weightedValue" },
              avgValue:      { $avg: "$value" },
            },
          },
        ]),
        Deal.aggregate([
          { $match: matchOpen },
          { $group: { _id: "$stageId", count: { $sum: 1 }, value: { $sum: "$value" } } },
          { $project: { _id: 0, stageId: { $toString: "$_id" }, count: 1, value: 1 } },
        ]),
        Deal.aggregate([
          { $match: matchOpen },
          { $group: { _id: "$status", count: { $sum: 1 }, value: { $sum: "$value" } } },
          { $project: { _id: 0, status: "$_id", count: 1, value: 1 } },
        ]),
        Deal.aggregate([
          { $match: matchOpen },
          { $group: { _id: "$riskLevel", count: { $sum: 1 } } },
          { $project: { _id: 0, riskLevel: "$_id", count: 1 } },
        ]),
        Deal.aggregate([
          {
            $match: {
              organizationId: new mongoose.Types.ObjectId(orgId),
              isDeleted: false,
              status: { $in: ["won", "lost"] },
              actualCloseDate: {
                $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $group: {
              _id:   null,
              won:   { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
              total: { $sum: 1 },
            },
          },
        ]),
      ]);

    const overviewData = overview[0] ?? {
      totalDeals: 0, totalValue: 0, weightedValue: 0, avgValue: 0,
    };

    const winRate =
      winRateData[0]?.total > 0
        ? (winRateData[0].won / winRateData[0].total) * 100
        : 0;

    return {
      totalDeals:      overviewData.totalDeals,
      totalValue:      overviewData.totalValue,
      weightedValue:   overviewData.weightedValue,
      averageDealSize: Math.round(overviewData.avgValue ?? 0),
      byStage,
      byStatus,
      byRiskLevel,
      winRate: Math.round(winRate * 100) / 100,
    };
  }

  /* ── BULK UPDATE STAGE ── */
  async bulkUpdateStage(
    dealIds: string[],
    stageId: string,
    userId: string,
    orgId: string
  ): Promise<{ matched: number; modified: number }> {
    if (!dealIds.length) return { matched: 0, modified: 0 };

    const validIds = dealIds.filter(isValidObjectId);

    if (!isValidObjectId(stageId)) {
      throw new ServiceError("Invalid stage ID", 400, "INVALID_ID");
    }

    const result = await Deal.updateMany(
      {
        _id: { $in: validIds.map(toObjectId) },
        organizationId: orgId,
        isDeleted: false,
      },
      {
        $set: {
          stageId:        toObjectId(stageId),
          lastActivityAt: new Date(),
          lastUpdatedBy:  toObjectId(userId),
        },
        $inc: { activityCount: 1 },
      }
    );

    logger.info(
      { orgId, userId, count: result.modifiedCount, stageId },
      "Bulk stage update"
    );

    return { matched: result.matchedCount, modified: result.modifiedCount };
  }
}

export default new DealService();
