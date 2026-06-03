// alert.model.ts
//
// Alert is a transient operational signal — a deal at risk, a stalled lead,
// a quota nearing exhaustion. Alerts surface in the UI's notification panel
// and get acknowledged/resolved/dismissed by users.
//
// Contrast with AuditLog (immutable forensic record) — alerts are mutable
// state that users actively manage. They have a lifecycle: open →
// acknowledged → resolved/dismissed.
//
// Design:
//   - Multi-tenant via organizationId (every query MUST filter by this)
//   - Soft-delete (isDeleted) so resolved alerts can be hidden but retained
//     for analytics ("we sent X alerts last month, Y were actionable")
//   - TTL on resolved/dismissed alerts (auto-cleanup after N days)
//   - Idempotency via dedupKey + partial unique index — engines fire
//     repeatedly, we don't want 47 copies of "Deal X is at risk"
//   - Audit fields: readBy, readAt, resolvedBy, resolvedAt, dismissedBy
//     — powers "who did what" forensics
//   - Instance methods for lifecycle transitions
//   - Static helpers for common queries

import mongoose, {
  Schema,
  Types,
  Model,
  HydratedDocument,
  CallbackWithoutResultAndOptionalError,
} from "mongoose";

// ============================================================
// CONSTANTS — vocabulary aligned with controller
// ============================================================

/**
 * Alert categories. Risk = something bad happening; Opportunity = something
 * good detected; Warning = informational. System-level for ops alerts.
 */
export const ALERT_TYPES = {
  RISK:        "risk",
  OPPORTUNITY: "opportunity",
  WARNING:     "warning",
  SYSTEM:      "system",
} as const;

export type AlertType = (typeof ALERT_TYPES)[keyof typeof ALERT_TYPES];

/**
 * Severity ordering — low → critical. Used for UI sorting and
 * notification routing (critical → email, high → in-app + push, etc.)
 */
export const ALERT_SEVERITIES = {
  LOW:      "low",
  MEDIUM:   "medium",
  HIGH:     "high",
  CRITICAL: "critical",
} as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[keyof typeof ALERT_SEVERITIES];

/**
 * Alert lifecycle states. open is the initial state. acknowledged means
 * a user saw it but hasn't acted. resolved means the underlying issue is
 * fixed. dismissed means the user marked it not actionable.
 */
export const ALERT_STATUSES = {
  OPEN:         "open",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED:     "resolved",
  DISMISSED:    "dismissed",
} as const;

export type AlertStatus = (typeof ALERT_STATUSES)[keyof typeof ALERT_STATUSES];

/**
 * What resource the alert is about. Extended from your original (lead, deal)
 * to cover the broader decision-intelligence vocabulary.
 */
export const ALERT_RELATED_TYPES = {
  LEAD:         "lead",
  DEAL:         "deal",
  PIPELINE:     "pipeline",
  USER:         "user",
  TEAM:         "team",
  ORGANIZATION: "organization",
  SYSTEM:       "system",
} as const;

export type AlertRelatedType = (typeof ALERT_RELATED_TYPES)[keyof typeof ALERT_RELATED_TYPES];

// Sorted severities (for ranking)
const SEVERITY_ORDER: AlertSeverity[] = [
  ALERT_SEVERITIES.LOW,
  ALERT_SEVERITIES.MEDIUM,
  ALERT_SEVERITIES.HIGH,
  ALERT_SEVERITIES.CRITICAL,
];

// Statuses considered "terminal" — alert lifecycle ends here
const TERMINAL_STATUSES: AlertStatus[] = [
  ALERT_STATUSES.RESOLVED,
  ALERT_STATUSES.DISMISSED,
];

// Statuses considered "active" — alert still needs user attention
const ACTIVE_STATUSES: AlertStatus[] = [
  ALERT_STATUSES.OPEN,
  ALERT_STATUSES.ACKNOWLEDGED,
];

// ============================================================
// CONFIG
// ============================================================

const ALERT_CONFIG = {
  /**
   * TTL for terminal alerts. Resolved/dismissed alerts auto-purge after
   * this many days. Default 30 days — long enough for retro analysis,
   * short enough to keep the collection tidy.
   *
   * Set ALERT_TTL_DISABLED=true to disable auto-cleanup entirely.
   */
  ttlDays:    parseInt(process.env.ALERT_TTL_DAYS ?? "30", 10),
  ttlDisabled: process.env.ALERT_TTL_DISABLED === "true",
} as const;

// ============================================================
// INTERFACES
// ============================================================

export interface IAlertRelatedTo {
  type:  AlertRelatedType;
  id:    Types.ObjectId;
  label?: string;  // optional display label (e.g., deal title at creation time)
}

export interface IAlert {
  /* Core */
  type:     AlertType;
  severity: AlertSeverity;
  title:    string;
  message:  string;

  /* Relation */
  relatedTo: IAlertRelatedTo;

  /* Multi-tenant */
  organizationId: Types.ObjectId;

  /* Lifecycle state */
  status: AlertStatus;
  isRead: boolean;

  /* Read tracking */
  readBy?: Types.ObjectId | null;
  readAt?: Date | null;

  /* Resolution tracking */
  resolvedBy?:   Types.ObjectId | null;
  resolvedAt?:   Date | null;
  resolution?:   string;          // optional note: "fixed by reassigning to user X"

  /* Dismissal tracking */
  dismissedBy?:     Types.ObjectId | null;
  dismissedAt?:     Date | null;
  dismissalReason?: string;        // optional note: "false positive"

  /* Source — who/what created this alert */
  source?:    string;              // "deal-risk-engine", "billing-webhook", "manual"
  triggeredBy?: Types.ObjectId | null;  // user, if manual

  /* Intelligence */
  dedupKey?:  string;
  metadata?:  Record<string, unknown>;
  impactScore?: number;            // 0-100 — engine's confidence/priority

  /* Action recommendation */
  recommendedAction?: string;      // "call this customer", "extend trial"
  actionUrl?:         string;      // deep-link into the app

  /* Soft delete */
  isDeleted:   boolean;
  deletedAt?:  Date | null;
  deletedBy?:  Types.ObjectId | null;

  /* Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/* ── Instance methods ── */
export interface IAlertMethods {
  isActive():    boolean;
  isTerminal():  boolean;
  markRead(userId: Types.ObjectId | string): void;
  resolve(userId: Types.ObjectId | string, note?: string): void;
  dismiss(userId: Types.ObjectId | string, reason?: string): void;
  acknowledge(userId: Types.ObjectId | string): void;
}

export type AlertDocument = HydratedDocument<IAlert, IAlertMethods>;

/* ── Static methods ── */
export interface IAlertModel extends Model<IAlert, {}, IAlertMethods> {
  findActiveByOrg(orgId: Types.ObjectId | string): Promise<AlertDocument[]>;
  findUnreadByOrg(orgId: Types.ObjectId | string): Promise<AlertDocument[]>;
  findCriticalByOrg(orgId: Types.ObjectId | string): Promise<AlertDocument[]>;
  findByResource(
    orgId:        Types.ObjectId | string,
    resourceType: AlertRelatedType,
    resourceId:   Types.ObjectId | string
  ): Promise<AlertDocument[]>;
  countUnread(orgId: Types.ObjectId | string): Promise<number>;
  countBySeverity(orgId: Types.ObjectId | string): Promise<Array<{ _id: AlertSeverity; count: number }>>;
}

// ============================================================
// HELPERS
// ============================================================

function isValidObjectId(id: unknown): boolean {
  if (id instanceof Types.ObjectId) return true;
  return typeof id === "string" && Types.ObjectId.isValid(id);
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  return new Types.ObjectId(id);
}

function severityRank(s: AlertSeverity): number {
  return SEVERITY_ORDER.indexOf(s);
}

// ============================================================
// SUB-SCHEMAS
// ============================================================

const RelatedToSchema = new Schema<IAlertRelatedTo>(
  {
    type: {
      type:     String,
      enum:     Object.values(ALERT_RELATED_TYPES),
      required: true,
    },
    id: {
      type:     Schema.Types.ObjectId,
      required: true,
    },
    label: {
      type:      String,
      trim:      true,
      maxlength: 200,
    },
  },
  { _id: false }
);

// ============================================================
// MAIN SCHEMA
// ============================================================

const AlertSchema = new Schema<IAlert, IAlertModel, IAlertMethods>(
  {
    /* ── Core ── */
    type: {
      type:     String,
      enum:     Object.values(ALERT_TYPES),
      required: true,
      index:    true,
    },
    severity: {
      type:     String,
      enum:     Object.values(ALERT_SEVERITIES),
      required: true,
      index:    true,
    },
    title: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 200,
    },
    message: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 2000,  // expanded from 1000 — engines may need more context
    },

    /* ── Relation ── */
    relatedTo: {
      type:     RelatedToSchema,
      required: true,
    },

    /* ── Multi-tenant ── */
    organizationId: {
      type:     Schema.Types.ObjectId,
      ref:      "Organization",
      required: true,
      index:    true,
    },

    /* ── Lifecycle ── */
    status: {
      type:    String,
      enum:    Object.values(ALERT_STATUSES),
      default: ALERT_STATUSES.OPEN,
      index:   true,
    },
    isRead: {
      type:    Boolean,
      default: false,
      index:   true,
    },

    /* ── Read tracking ── */
    readBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    readAt: { type: Date, default: null },

    /* ── Resolution tracking ── */
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, trim: true, maxlength: 1000 },

    /* ── Dismissal tracking ── */
    dismissedBy:     { type: Schema.Types.ObjectId, ref: "User", default: null },
    dismissedAt:     { type: Date, default: null },
    dismissalReason: { type: String, trim: true, maxlength: 500 },

    /* ── Source ── */
    source: {
      type:      String,
      trim:      true,
      maxlength: 100,
      index:     true,
    },
    triggeredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    /* ── Intelligence ── */
    dedupKey: {
      type:      String,
      trim:      true,
      maxlength: 200,
    },
    metadata: {
      type:    Schema.Types.Mixed,
      default: {},
    },
    impactScore: {
      type:    Number,
      min:     0,
      max:     100,
      default: 0,
    },

    /* ── Action ── */
    recommendedAction: { type: String, trim: true, maxlength: 500 },
    actionUrl:         { type: String, trim: true, maxlength: 2000 },

    /* ── Soft delete ── */
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date,    default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize:   false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        const r = ret as Record<string, unknown>;
        delete r.__v;
        return r;
      },
    },
    toObject: { virtuals: true },
  }
);

// ============================================================
// VIRTUALS
// ============================================================

AlertSchema.virtual("ageMinutes").get(function (this: AlertDocument) {
  return Math.floor((Date.now() - this.createdAt.getTime()) / 60_000);
});

AlertSchema.virtual("isCritical").get(function (this: AlertDocument) {
  return this.severity === ALERT_SEVERITIES.CRITICAL;
});

AlertSchema.virtual("severityRank").get(function (this: AlertDocument) {
  return severityRank(this.severity);
});

// ============================================================
// INSTANCE METHODS
// ============================================================

AlertSchema.methods.isActive = function (this: AlertDocument): boolean {
  return ACTIVE_STATUSES.includes(this.status);
};

AlertSchema.methods.isTerminal = function (this: AlertDocument): boolean {
  return TERMINAL_STATUSES.includes(this.status);
};

AlertSchema.methods.markRead = function (
  this:   AlertDocument,
  userId: Types.ObjectId | string
): void {
  if (this.isRead) return;
  this.isRead = true;
  this.readBy = toObjectId(userId);
  this.readAt = new Date();
};

AlertSchema.methods.acknowledge = function (
  this:   AlertDocument,
  userId: Types.ObjectId | string
): void {
  if (this.isTerminal()) return;
  this.status = ALERT_STATUSES.ACKNOWLEDGED;
  if (!this.isRead) {
    this.isRead = true;
    this.readBy = toObjectId(userId);
    this.readAt = new Date();
  }
};

AlertSchema.methods.resolve = function (
  this:   AlertDocument,
  userId: Types.ObjectId | string,
  note?:  string
): void {
  if (this.isTerminal()) return;
  this.status     = ALERT_STATUSES.RESOLVED;
  this.resolvedBy = toObjectId(userId);
  this.resolvedAt = new Date();
  if (note && note.trim().length > 0) {
    this.resolution = note.trim();
  }
  if (!this.isRead) {
    this.isRead = true;
    this.readBy = toObjectId(userId);
    this.readAt = new Date();
  }
};

AlertSchema.methods.dismiss = function (
  this:    AlertDocument,
  userId:  Types.ObjectId | string,
  reason?: string
): void {
  if (this.isTerminal()) return;
  this.status      = ALERT_STATUSES.DISMISSED;
  this.dismissedBy = toObjectId(userId);
  this.dismissedAt = new Date();
  if (reason && reason.trim().length > 0) {
    this.dismissalReason = reason.trim();
  }
  if (!this.isRead) {
    this.isRead = true;
    this.readBy = toObjectId(userId);
    this.readAt = new Date();
  }
};

// ============================================================
// STATIC METHODS
// ============================================================

AlertSchema.statics.findActiveByOrg = function (
  this:  IAlertModel,
  orgId: Types.ObjectId | string
) {
  return this.find({
    organizationId: orgId,
    status:         { $in: ACTIVE_STATUSES },
    isDeleted:      false,
  }).sort({ severity: -1, createdAt: -1 });
};

AlertSchema.statics.findUnreadByOrg = function (
  this:  IAlertModel,
  orgId: Types.ObjectId | string
) {
  return this.find({
    organizationId: orgId,
    isRead:         false,
    isDeleted:      false,
  }).sort({ createdAt: -1 });
};

AlertSchema.statics.findCriticalByOrg = function (
  this:  IAlertModel,
  orgId: Types.ObjectId | string
) {
  return this.find({
    organizationId: orgId,
    severity:       ALERT_SEVERITIES.CRITICAL,
    status:         { $in: ACTIVE_STATUSES },
    isDeleted:      false,
  }).sort({ createdAt: -1 });
};

AlertSchema.statics.findByResource = function (
  this:         IAlertModel,
  orgId:        Types.ObjectId | string,
  resourceType: AlertRelatedType,
  resourceId:   Types.ObjectId | string
) {
  if (!isValidObjectId(resourceId)) {
    return this.find({ _id: null }); // empty result
  }

  return this.find({
    organizationId:    orgId,
    "relatedTo.type":  resourceType,
    "relatedTo.id":    toObjectId(resourceId),
    isDeleted:         false,
  }).sort({ createdAt: -1 });
};

AlertSchema.statics.countUnread = function (
  this:  IAlertModel,
  orgId: Types.ObjectId | string
): Promise<number> {
  return this.countDocuments({
    organizationId: orgId,
    isRead:         false,
    isDeleted:      false,
  });
};

AlertSchema.statics.countBySeverity = function (
  this:  IAlertModel,
  orgId: Types.ObjectId | string
) {
  return this.aggregate([
    {
      $match: {
        organizationId: toObjectId(orgId),
        status:         { $in: ACTIVE_STATUSES },
        isDeleted:      false,
      },
    },
    {
      $group: {
        _id:   "$severity",
        count: { $sum: 1 },
      },
    },
  ]);
};

// ============================================================
// HOOKS
// ============================================================

/**
 * Normalize and validate before save.
 */
AlertSchema.pre<AlertDocument>(
  "validate",
  function (
    _opts?: Record<string, unknown>,
    next?:  CallbackWithoutResultAndOptionalError
  ) {
    if (this.title)   this.title   = this.title.trim();
    if (this.message) this.message = this.message.trim();
    if (this.source)  this.source  = this.source.trim();

    // Auto-stamp readAt if isRead becomes true without explicit readAt
    if (this.isRead && !this.readAt) {
      this.readAt = new Date();
    }

    // Auto-set resolvedAt/dismissedAt on status transitions
    if (this.status === ALERT_STATUSES.RESOLVED && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }
    if (this.status === ALERT_STATUSES.DISMISSED && !this.dismissedAt) {
      this.dismissedAt = new Date();
    }

    if (next) next();
  }
);

/**
 * On save: auto-mark isRead when terminal — resolved/dismissed alerts
 * are implicitly "read" by definition.
 */
AlertSchema.pre<AlertDocument>(
  "save",
  function (
    _opts?: Record<string, unknown>,
    next?:  CallbackWithoutResultAndOptionalError
  ) {
    if (TERMINAL_STATUSES.includes(this.status) && !this.isRead) {
      this.isRead = true;
      if (!this.readAt) this.readAt = new Date();
    }

    if (next) next();
  }
);

// ============================================================
// INDEXES
// ============================================================

// Main org-scoped dashboard query
AlertSchema.index({ organizationId: 1, isDeleted: 1, status: 1, createdAt: -1 });

// Unread badge query (notification panel)
AlertSchema.index({ organizationId: 1, isRead: 1, isDeleted: 1, createdAt: -1 });

// Severity filtering (sidebar)
AlertSchema.index({ organizationId: 1, severity: 1, status: 1 });

// Resource lookup (alerts for this deal)
AlertSchema.index({ organizationId: 1, "relatedTo.type": 1, "relatedTo.id": 1 });

// Source-based query (alerts from this engine)
AlertSchema.index({ organizationId: 1, source: 1, createdAt: -1 });

// Critical alerts ranking
AlertSchema.index({ organizationId: 1, severity: 1, isDeleted: 1, createdAt: -1 });

// Dedup — partial unique to allow null dedupKeys
AlertSchema.index(
  { organizationId: 1, dedupKey: 1 },
  {
    unique:                  true,
    partialFilterExpression: { dedupKey: { $exists: true, $ne: null } },
    name:                    "alert_dedup_org_key",
  }
);

// ============================================================
// TTL — auto-cleanup terminal alerts
// Only resolved/dismissed alerts expire. Open/acknowledged alerts
// stay forever (or until manually deleted).
//
// Disabled via ALERT_TTL_DISABLED=true env var if you need to keep
// everything (compliance, debugging, etc.)
// ============================================================

if (!ALERT_CONFIG.ttlDisabled && ALERT_CONFIG.ttlDays > 0) {
  AlertSchema.index(
    { resolvedAt: 1 },
    {
      expireAfterSeconds:      ALERT_CONFIG.ttlDays * 24 * 60 * 60,
      partialFilterExpression: { status: ALERT_STATUSES.RESOLVED },
      name:                    "alert_ttl_resolved",
    }
  );

  AlertSchema.index(
    { dismissedAt: 1 },
    {
      expireAfterSeconds:      ALERT_CONFIG.ttlDays * 24 * 60 * 60,
      partialFilterExpression: { status: ALERT_STATUSES.DISMISSED },
      name:                    "alert_ttl_dismissed",
    }
  );
}

// ============================================================
// MODEL
// ============================================================

const Alert: IAlertModel =
  (mongoose.models.Alert as IAlertModel | undefined) ??
  mongoose.model<IAlert, IAlertModel>("Alert", AlertSchema);

export default Alert;