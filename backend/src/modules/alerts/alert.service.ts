import { Types } from "mongoose";
import Alert from "./alert.model.js";

/* =====================================================
   TYPES
===================================================== */

export type AlertType     = "risk" | "opportunity" | "warning";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

/* Status vocabulary MUST match alert.model.ts ALERT_STATUSES.
   The model uses: open | acknowledged | resolved | dismissed.
   (This file previously used "active" — a value that does not exist
   in the schema, so every status-filtered query matched nothing.) */
export type AlertStatus   = "open" | "acknowledged" | "resolved" | "dismissed";

export interface CreateAlertInput {
  type:     AlertType;
  severity: AlertSeverity;
  title:    string;
  message:  string;
  relatedTo: {
    type: "lead" | "deal";
    id:   Types.ObjectId | string;
  };
  organizationId: Types.ObjectId | string;
  metadata?:      Record<string, unknown>;
}

export interface GetAlertsOptions {
  page?:     number;
  limit?:    number;
  status?:   AlertStatus;
  isRead?:   boolean;
  severity?: AlertSeverity;
}

export interface PaginatedAlerts {
  data: unknown[];
  pagination: {
    page:  number;
    limit: number;
    total: number;
    pages: number;
  };
}

/* =====================================================
   HELPERS
===================================================== */

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  if (!Types.ObjectId.isValid(id)) throw new Error(`Invalid ObjectId: ${id}`);
  return new Types.ObjectId(id);
}

function buildDedupKey(
  type:        AlertType,
  relatedType: "lead" | "deal",
  relatedId:   Types.ObjectId
): string {
  return `${type}-${relatedType}-${relatedId.toString()}`;
}

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

/* =====================================================
   SERVICE
===================================================== */

class AlertService {

  /* ── CREATE ALERT (dedup + cooldown + atomic upsert) ── */
  async createAlert(data: CreateAlertInput): Promise<unknown> {
    const orgId     = toObjectId(data.organizationId);
    const relatedId = toObjectId(data.relatedTo.id);
    const dedupKey  = buildDedupKey(data.type, data.relatedTo.type, relatedId);

    /* Fast-path: skip write if alert exists within cooldown window */
    const cooldownTime = new Date(Date.now() - COOLDOWN_MS);
    const existing = await Alert.findOne({
      organizationId: orgId,
      dedupKey,
      status:    "open",
      createdAt: { $gte: cooldownTime },
    })
      .select("_id")
      .lean();

    if (existing) return existing;

    /* Atomic upsert — handles concurrent writes safely */
    try {
      return await Alert.findOneAndUpdate(
        { organizationId: orgId, dedupKey },
        {
          $setOnInsert: {
            type:      data.type,
            severity:  data.severity,
            title:     data.title,
            message:   data.message,
            relatedTo: { type: data.relatedTo.type, id: relatedId },
            organizationId: orgId,
            dedupKey,
            isRead:   false,
            status:   "open",
            metadata: data.metadata ?? {},
          },
        },
        { new: true, upsert: true }
      ).lean();
    } catch (err: unknown) {
      /* Duplicate key — another process won the race; return existing */
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: number }).code === 11000
      ) {
        return Alert.findOne({ organizationId: orgId, dedupKey }).lean();
      }
      throw err;
    }
  }

  /* ── GET ALERTS (paginated + filterable) ──
     Default status filter is "open" (the initial lifecycle state),
     not the old "active" which never existed in the schema. */
  async getAlerts(
    orgId:   string,
    options: GetAlertsOptions = {}
  ): Promise<PaginatedAlerts> {
    const {
      page     = 1,
      limit    = 20,
      status,
      isRead,
      severity,
    } = options;

    const query: Record<string, unknown> = {
      organizationId: toObjectId(orgId),
      isDeleted:      false,
    };

    /* Only filter by status when the caller specifies one.
       The alerts page passes no status, so it should see all
       non-deleted alerts (open + acknowledged). */
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ["open", "acknowledged"] };
    }

    if (typeof isRead === "boolean") query.isRead   = isRead;
    if (severity)                    query.severity = severity;

    const skip = (page - 1) * limit;

    const [alerts, total] = await Promise.all([
      Alert.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Alert.countDocuments(query),
    ]);

    return {
      data: alerts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /* ── UNREAD COUNT ── */
  async getUnreadCount(orgId: string): Promise<number> {
    return Alert.countDocuments({
      organizationId: toObjectId(orgId),
      isRead:  false,
      isDeleted: false,
      status:  { $in: ["open", "acknowledged"] },
    });
  }

  /* ── MARK AS READ ── */
  async markAsRead(alertId: string): Promise<unknown | null> {
    if (!Types.ObjectId.isValid(alertId)) return null;

    return Alert.findByIdAndUpdate(
      alertId,
      { isRead: true },
      { new: true }
    ).lean();
  }

  /* ── MARK ALL AS READ ── */
  async markAllAsRead(orgId: string): Promise<unknown> {
    return Alert.updateMany(
      { organizationId: toObjectId(orgId), isRead: false },
      { isRead: true }
    );
  }

  /* ── RESOLVE ALERT ── */
  async resolveAlert(alertId: string): Promise<unknown | null> {
    if (!Types.ObjectId.isValid(alertId)) return null;

    return Alert.findByIdAndUpdate(
      alertId,
      { status: "resolved", isRead: true, resolvedAt: new Date() },
      { new: true }
    ).lean();
  }

  /* ── RESOLVE BY ENTITY (smart bulk cleanup) ── */
  async resolveByEntity(
    relatedType:    "lead" | "deal",
    relatedId:      string | Types.ObjectId,
    organizationId: string | Types.ObjectId
  ): Promise<unknown> {
    return Alert.updateMany(
      {
        "relatedTo.type": relatedType,
        "relatedTo.id":   toObjectId(relatedId),
        organizationId:   toObjectId(organizationId),
        status:           { $in: ["open", "acknowledged"] },
      },
      { status: "resolved", isRead: true, resolvedAt: new Date() }
    );
  }

  /* ── DELETE ALERT ── */
  async deleteAlert(alertId: string): Promise<unknown | null> {
    if (!Types.ObjectId.isValid(alertId)) return null;
    return Alert.findByIdAndDelete(alertId).lean();
  }

  /* ── PURGE OLD RESOLVED ALERTS (maintenance) ── */
  async purgeOldResolved(
    organizationId: string | Types.ObjectId,
    olderThanDays = 30
  ): Promise<{ deletedCount: number }> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await Alert.deleteMany({
      organizationId: toObjectId(organizationId),
      status:      "resolved",
      createdAt:   { $lt: cutoff },
    });

    return { deletedCount: result.deletedCount ?? 0 };
  }
}

export default new AlertService();