// leadActivity.service.ts
import mongoose, { Types, ClientSession } from "mongoose";
import LeadActivity, {
  LeadActivityAction,
  LeadActivityActorType,
  LeadActivityCategory,
  IFieldChange,
  IRequestContext,
  LeadActivityDocument,
} from "./leadActivity.model.js";
import Lead from "../leads/lead.model.js";
import LeadScoreService from "../leads/leadScore.service.js";
import logger from "../../utils/logger.js";

/* ================= ERRORS ================= */

class ActivityServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "ACTIVITY_SERVICE_ERROR"
  ) {
    super(message);
    this.name = "ActivityServiceError";
  }
}

/* ================= TYPES ================= */

export interface LogLeadActivityInput {
  leadId: string;
  action: LeadActivityAction;
  userId?: string | null;
  organizationId?: string;
  actorType?: LeadActivityActorType;
  actorName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  changes?: IFieldChange[];
  description?: string;
  requestContext?: IRequestContext;
  relatedEntities?: Array<{
    entityType: "deal" | "user" | "task" | "email" | "call" | "meeting" | "note";
    entityId: string | Types.ObjectId;
  }>;
  idempotencyKey?: string;
  isInternal?: boolean;
  skipScoring?: boolean;
  skipLeadUpdate?: boolean;
  session?: ClientSession;
}

export interface LogActivityResult {
  activity: LeadActivityDocument;
  leadUpdated: boolean;
  scoreRecalculated: boolean;
  deduplicated: boolean;
}

/* ================= ACTION POLICIES ================= */

const NON_ENGAGEMENT_ACTIONS: ReadonlySet<LeadActivityAction> = new Set([
  "AI_ENRICHED",
  "AI_SCORED",
  "AI_RECOMMENDATION_GENERATED",
  "SYNCED_FROM_HUBSPOT",
  "SYNCED_FROM_SALESFORCE",
  "IMPORTED",
  "EXPORTED",
]);

const SCORE_TRIGGERING_ACTIONS: ReadonlySet<LeadActivityAction> = new Set([
  "EMAIL_SENT",
  "EMAIL_OPENED",
  "EMAIL_REPLIED",
  "CALL_LOGGED",
  "MEETING_SCHEDULED",
  "MEETING_COMPLETED",
  "QUALIFIED",
  "DISQUALIFIED",
  "STAGE_CHANGED",
  "STATUS_CHANGED",
  "AI_ENRICHED",
  "AI_SCORED",
]);

/* ================= HELPERS ================= */

function isValidObjectId(id: string | Types.ObjectId | undefined | null): boolean {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id.toString());
}

/* ================= SERVICE ================= */

class LeadActivityService {

  /* ── LOG ACTIVITY ── */
  async logActivity(input: LogLeadActivityInput): Promise<LogActivityResult> {
    if (!isValidObjectId(input.leadId)) {
      throw new ActivityServiceError("Invalid leadId", 400, "INVALID_ID");
    }

    if (input.userId && !isValidObjectId(input.userId)) {
      throw new ActivityServiceError("Invalid userId", 400, "INVALID_ID");
    }

    if (!input.action) {
      throw new ActivityServiceError("Action is required", 400, "MISSING_ACTION");
    }

    const actorType: LeadActivityActorType =
      input.actorType ?? (input.userId ? "user" : "system");

    let organizationId = input.organizationId;
    let lead = null;

    if (!organizationId || !input.skipLeadUpdate) {
      lead = await Lead.findById(input.leadId).session(input.session ?? null);
      if (!lead) {
        throw new ActivityServiceError("Lead not found", 404, "LEAD_NOT_FOUND");
      }
      organizationId = organizationId ?? lead.organizationId.toString();
    }

    if (input.idempotencyKey) {
      const existing = await LeadActivity.findOne({
        idempotencyKey: input.idempotencyKey,
      }).lean<LeadActivityDocument>();

      if (existing) {
        logger.info(
          { leadId: input.leadId, action: input.action, idempotencyKey: input.idempotencyKey },
          "Activity log deduplicated via idempotency key"
        );
        return {
          activity: existing,
          leadUpdated: false,
          scoreRecalculated: false,
          deduplicated: true,
        };
      }
    }

    /* ── Build doc — only include defined optional fields ── */
    const docToCreate = {
      organizationId,
      lead: input.leadId,
      action: input.action,
      performedBy: input.userId ?? null,
      actorType,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue ?? null,
      changes: input.changes ?? [],
      isInternal: input.isInternal ?? false,
      ...(input.actorName     !== undefined && { actorName:      input.actorName }),
      ...(input.description   !== undefined && { description:    input.description }),
      ...(input.requestContext !== undefined && { requestContext: input.requestContext }),
      ...(input.idempotencyKey !== undefined && { idempotencyKey: input.idempotencyKey }),
      ...(input.relatedEntities !== undefined && {
        relatedEntities: input.relatedEntities.map(e => ({
          entityType: e.entityType,
          entityId: typeof e.entityId === "string"
            ? new mongoose.Types.ObjectId(e.entityId)
            : e.entityId,
        })),
      }),
    };

  let activity: LeadActivityDocument;
try {
  const created = await LeadActivity.create(
    [docToCreate],
    { session: input.session ?? null }
  );

  const doc = created[0];
  if (!doc) {
    throw new ActivityServiceError("Failed to create activity", 500, "CREATE_FAILED");
  }
  activity = doc;
} catch (err: any) {
  if (err.code === 11000 && input.idempotencyKey) {
    const existing = await LeadActivity.findOne({
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      return {
        activity: existing,
        leadUpdated: false,
        scoreRecalculated: false,
        deduplicated: true,
      };
    }
  }
  throw err;
}

    let leadUpdated = false;
    if (
      !input.skipLeadUpdate &&
      !NON_ENGAGEMENT_ACTIONS.has(input.action) &&
      lead
    ) {
      try {
        lead.activityCount  = (lead.activityCount ?? 0) + 1;
        lead.lastActivityAt = new Date();
        await lead.save({ session: input.session ?? null });
        leadUpdated = true;
      } catch (leadErr) {
        logger.error(
          { leadId: input.leadId, action: input.action, error: (leadErr as Error).message },
          "Failed to update lead counters after activity"
        );
      }
    }

    let scoreRecalculated = false;
    if (!input.skipScoring && SCORE_TRIGGERING_ACTIONS.has(input.action)) {
      this.recalculateScoreSafely(input.leadId);
      scoreRecalculated = true;
    }

    logger.info(
      { leadId: input.leadId, action: input.action, actorType, activityId: activity._id },
      "Activity logged"
    );

    return {
      activity,
      leadUpdated,
      scoreRecalculated,
      deduplicated: false,
    };
  }

  /* ── RECALC SCORE ── */
  private recalculateScoreSafely(leadId: string): void {
    LeadScoreService.calculateLeadScore(leadId).catch((err: Error) => {
      logger.error(
        { leadId, error: err.message },
        "Score recalculation failed (non-blocking)"
      );
    });
  }

  /* ── BULK LOG ── */
  async bulkLogActivities(
    inputs: LogLeadActivityInput[]
  ): Promise<{ created: number; deduplicated: number; failed: number }> {
    if (!inputs.length) return { created: 0, deduplicated: 0, failed: 0 };

    let created = 0;
    let deduplicated = 0;
    let failed = 0;

    const CHUNK_SIZE = 100;
    for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
      const chunk = inputs.slice(i, i + CHUNK_SIZE);

      const results = await Promise.allSettled(
        chunk.map(input =>
          this.logActivity({
            ...input,
            skipScoring:     input.skipScoring     ?? true,
            skipLeadUpdate:  input.skipLeadUpdate  ?? true,
          })
        )
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.deduplicated) deduplicated++;
          else created++;
        } else {
          failed++;
          logger.error(
            { error: r.reason?.message },
            "Bulk activity log failure"
          );
        }
      }
    }

    logger.info(
      { total: inputs.length, created, deduplicated, failed },
      "Bulk activity logging complete"
    );

    return { created, deduplicated, failed };
  }

  /* ── TIMELINE ── */
  async getTimeline(
    leadId: string,
    opts: {
      limit?: number;
      before?: Date;
      categories?: LeadActivityCategory[];
      includeInternal?: boolean;
    } = {}
  ): Promise<LeadActivityDocument[]> {
    if (!isValidObjectId(leadId)) {
      throw new ActivityServiceError("Invalid leadId", 400, "INVALID_ID");
    }

    const query: Record<string, unknown> = { lead: leadId };

    if (!opts.includeInternal)   query.isInternal = false;
    if (opts.before)             query.createdAt  = { $lt: opts.before };
    if (opts.categories?.length) query.category   = { $in: opts.categories };

    return LeadActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 50, 200))
      .populate("performedBy", "name email avatar")
      .lean<LeadActivityDocument[]>();
  }

  /* ── USER ACTIVITY FEED ── */
  async getUserActivityFeed(
    userId: string,
    organizationId: string,
    opts: {
      limit?: number;
      since?: Date;
      categories?: LeadActivityCategory[];
    } = {}
  ): Promise<LeadActivityDocument[]> {
    if (!isValidObjectId(userId) || !isValidObjectId(organizationId)) {
      throw new ActivityServiceError("Invalid ID", 400, "INVALID_ID");
    }

    const query: Record<string, unknown> = {
      organizationId,
      performedBy: userId,
      isInternal: false,
    };

    if (opts.since)              query.createdAt = { $gte: opts.since };
    if (opts.categories?.length) query.category  = { $in: opts.categories };

    return LeadActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 100, 500))
      .populate("lead", "name email company")
      .lean<LeadActivityDocument[]>();
  }

  /* ── ORG AUDIT FEED ── */
  async getOrgAuditFeed(
    organizationId: string,
    opts: {
      limit?: number;
      before?: Date;
      categories?: LeadActivityCategory[];
      actions?: LeadActivityAction[];
      actorType?: LeadActivityActorType;
    } = {}
  ): Promise<LeadActivityDocument[]> {
    if (!isValidObjectId(organizationId)) {
      throw new ActivityServiceError("Invalid orgId", 400, "INVALID_ID");
    }

    const query: Record<string, unknown> = { organizationId };

    if (opts.before)             query.createdAt = { $lt: opts.before };
    if (opts.categories?.length) query.category  = { $in: opts.categories };
    if (opts.actions?.length)    query.action    = { $in: opts.actions };
    if (opts.actorType)          query.actorType = opts.actorType;

    return LeadActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 100, 500))
      .populate("performedBy", "name email")
      .populate("lead", "name email")
      .lean<LeadActivityDocument[]>();
  }

  /* ── STATS ── */
  async getActivityStats(
    organizationId: string,
    opts: { since?: Date; userId?: string } = {}
  ): Promise<{
    totalActivities: number;
    byCategory: Array<{ category: string; count: number }>;
    byAction: Array<{ action: string; count: number }>;
    byActor: Array<{ actorType: string; count: number }>;
    topPerformers: Array<{ userId: string; count: number }>;
  }> {
    const match: Record<string, unknown> = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      isInternal: false,
    };

    if (opts.since)  match.createdAt   = { $gte: opts.since };
    if (opts.userId) match.performedBy = new mongoose.Types.ObjectId(opts.userId);

    const [overview, byCategory, byAction, byActor, topPerformers] = await Promise.all([
      LeadActivity.countDocuments(match),
      LeadActivity.aggregate([
        { $match: match },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $project: { _id: 0, category: "$_id", count: 1 } },
        { $sort: { count: -1 } },
      ]),
      LeadActivity.aggregate([
        { $match: match },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $project: { _id: 0, action: "$_id", count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      LeadActivity.aggregate([
        { $match: match },
        { $group: { _id: "$actorType", count: { $sum: 1 } } },
        { $project: { _id: 0, actorType: "$_id", count: 1 } },
      ]),
      LeadActivity.aggregate([
        { $match: { ...match, actorType: "user", performedBy: { $ne: null } } },
        { $group: { _id: "$performedBy", count: { $sum: 1 } } },
        { $project: { _id: 0, userId: { $toString: "$_id" }, count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return {
      totalActivities: overview,
      byCategory,
      byAction,
      byActor,
      topPerformers,
    };
  }
}

/* ================= EXPORTS ================= */

const leadActivityService = new LeadActivityService();

export const logLeadActivity = (input: LogLeadActivityInput) =>
  leadActivityService.logActivity(input);

export default leadActivityService;