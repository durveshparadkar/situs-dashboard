// audit.model.ts
import mongoose, {
  Schema,
  Model,
  Types,
  HydratedDocument,
   CallbackWithoutResultAndOptionalError,
  Query,
} from "mongoose";

/* =====================================================
   ENUMS — exhaustive action & resource taxonomy
===================================================== */

export enum AuditAction {
  /* ── Generic CRUD ── */
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  RESTORE = "RESTORE",
  ARCHIVE = "ARCHIVE",
  BULK_DELETED = "BULK_DELETED",
  BULK_UPDATED = "BULK_UPDATED",

  /* ── Auth & sessions ── */
  LOGIN = "LOGIN",
  LOGIN_FAILED = "LOGIN_FAILED",
  LOGOUT = "LOGOUT",
  PASSWORD_CHANGED = "PASSWORD_CHANGED",
  PASSWORD_RESET = "PASSWORD_RESET",
  TWO_FACTOR_ENABLED = "TWO_FACTOR_ENABLED",
  TWO_FACTOR_DISABLED = "TWO_FACTOR_DISABLED",
  SESSION_REVOKED = "SESSION_REVOKED",

  /* ── Access control ── */
  ROLE_CHANGED = "ROLE_CHANGED",
  PERMISSION_GRANTED = "PERMISSION_GRANTED",
  PERMISSION_REVOKED = "PERMISSION_REVOKED",
  ACCESS_DENIED = "ACCESS_DENIED",

  /* ── Org & team management ── */
  ORGANIZATION_CREATED = "ORGANIZATION_CREATED",
  ORGANIZATION_UPDATED = "ORGANIZATION_UPDATED",
  ORGANIZATION_DELETED = "ORGANIZATION_DELETED",
  USER_INVITED = "USER_INVITED",
  USER_JOINED = "USER_JOINED",
  USER_REMOVED = "USER_REMOVED",
  USER_DELETED = "USER_DELETED",
  INVITE_SENT = "INVITE_SENT",
  INVITE_ACCEPTED = "INVITE_ACCEPTED",
  INVITE_REVOKED = "INVITE_REVOKED",

  /* ── API & integrations ── */
  API_KEY_CREATED = "API_KEY_CREATED",
  API_KEY_REVOKED = "API_KEY_REVOKED",
  INTEGRATION_CONNECTED = "INTEGRATION_CONNECTED",
  INTEGRATION_DISCONNECTED = "INTEGRATION_DISCONNECTED",
  WEBHOOK_RECEIVED = "WEBHOOK_RECEIVED",

  /* ── Data ops ── */
  DATA_EXPORTED = "DATA_EXPORTED",
  DATA_IMPORTED = "DATA_IMPORTED",

  /* ── Billing ── */
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  SUBSCRIPTION_UPDATED = "SUBSCRIPTION_UPDATED",
  SUBSCRIPTION_CANCELLED = "SUBSCRIPTION_CANCELLED",
  PAYMENT_SUCCEEDED = "PAYMENT_SUCCEEDED",
  PAYMENT_FAILED = "PAYMENT_FAILED",

  /* ── Domain-specific (Situs decision engine) ── */
  DEAL_STAGE_CHANGED = "DEAL_STAGE_CHANGED",
  DEAL_RISK_ESCALATED = "DEAL_RISK_ESCALATED",
  AI_RECOMMENDATION_GENERATED = "AI_RECOMMENDATION_GENERATED",
  AI_RECOMMENDATION_ACCEPTED = "AI_RECOMMENDATION_ACCEPTED",
  AI_RECOMMENDATION_REJECTED = "AI_RECOMMENDATION_REJECTED",
}

export enum AuditResource {
  ORGANIZATION = "ORGANIZATION",
  USER = "USER",
  ROLE = "ROLE",
  TEAM = "TEAM",
  INVITE = "INVITE",
  BILLING = "BILLING",
  SUBSCRIPTION = "SUBSCRIPTION",
  PAYMENT = "PAYMENT",
  API_KEY = "API_KEY",
  INTEGRATION = "INTEGRATION",
  WEBHOOK = "WEBHOOK",
  DEAL = "DEAL",
  LEAD = "LEAD",
  CONTACT = "CONTACT",
  ACCOUNT = "ACCOUNT",
  PIPELINE = "PIPELINE",
  CAMPAIGN = "CAMPAIGN",
  REPORT = "REPORT",
  AI_RECOMMENDATION = "AI_RECOMMENDATION",
  ENTITY = "ENTITY",
  SYSTEM = "SYSTEM",
}

export type AuditOutcome = "success" | "failure" | "denied";

export type AuditSeverity = "info" | "warn" | "critical";

export type AuditActorType =
  | "user"
  | "system"
  | "ai"
  | "integration"
  | "api"
  | "cron";

/* =====================================================
   SUB-SCHEMAS
===================================================== */

export interface IAuditRequestContext {
  ipAddress?: string;
  userAgent?: string;
  source?: "web" | "mobile" | "api" | "cron" | "webhook" | "cli";
  requestId?: string;
  sessionId?: string;
  geoCountry?: string;
  geoCity?: string;
}

const AuditRequestContextSchema = new Schema<IAuditRequestContext>(
  {
    ipAddress:  { type: String, trim: true, maxlength: 45 }, // IPv6 max
    userAgent:  { type: String, trim: true, maxlength: 500 },
    source: {
      type: String,
      enum: ["web", "mobile", "api", "cron", "webhook", "cli"],
    },
    requestId:  { type: String, trim: true, maxlength: 100 },
    sessionId:  { type: String, trim: true, maxlength: 100 },
    geoCountry: { type: String, trim: true, maxlength: 4 },
    geoCity:    { type: String, trim: true, maxlength: 100 },
  },
  { _id: false }
);

/* =====================================================
   INTERFACE
===================================================== */

export interface IAuditLog {
  /* Scope */
  organizationId: Types.ObjectId;

  /* Actor */
  userId?: Types.ObjectId | null;
  actorType: AuditActorType;
  actorName?: string;            // denormalized for fast display

  /* What happened */
  action: AuditAction;
  resource: AuditResource;
  resourceId?: Types.ObjectId | null;

  /* Outcome */
  outcome: AuditOutcome;
  severity: AuditSeverity;
  errorMessage?: string;

  /* Change tracking */
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;

  /* Forensics */
  requestContext?: IAuditRequestContext;

  /* Idempotency */
  idempotencyKey?: string;

  /* Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;

/* Static methods */
export interface IAuditLogModel extends Model<IAuditLog> {
  findByOrg(
    orgId: Types.ObjectId | string,
    opts?: { limit?: number; before?: Date; severity?: AuditSeverity }
  ): Promise<AuditLogDocument[]>;
  findByResource(
    resource: AuditResource,
    resourceId: Types.ObjectId | string
  ): Promise<AuditLogDocument[]>;
  findCriticalEvents(
    orgId: Types.ObjectId | string,
    since?: Date
  ): Promise<AuditLogDocument[]>;
}

/* =====================================================
   SCHEMA
===================================================== */

const auditSchema = new Schema<IAuditLog, IAuditLogModel>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    actorType: {
      type: String,
      enum: ["user", "system", "ai", "integration", "api", "cron"] as AuditActorType[],
      required: true,
      default: "user",
      index: true,
    },

    actorName: { type: String, trim: true, maxlength: 200 },

    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: true,
      index: true,
    },

    resource: {
      type: String,
      enum: Object.values(AuditResource),
      required: true,
      index: true,
    },

    resourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    outcome: {
      type: String,
      enum: ["success", "failure", "denied"] as AuditOutcome[],
      required: true,
      default: "success",
      index: true,
    },

    severity: {
      type: String,
      enum: ["info", "warn", "critical"] as AuditSeverity[],
      required: true,
      default: "info",
      index: true,
    },

    errorMessage: { type: String, trim: true, maxlength: 2000 },

    before:   { type: Schema.Types.Mixed, default: null },
    after:    { type: Schema.Types.Mixed, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },

    requestContext: { type: AuditRequestContextSchema, default: undefined },

    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 200,
      sparse: true,
      unique: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
  }
);


/* =====================================================
   IMMUTABILITY — audit logs MUST NEVER be modified
===================================================== */

type AuditDoc = HydratedDocument<IAuditLog>;

// ✅ Document middleware (no next, no overload issues)
auditSchema.pre<AuditDoc>("save", async function () {
  if (!this.isNew) {
    throw new Error("Audit logs are immutable and cannot be modified");
  }
});

// ✅ Query middleware — force correct overload using RegExp
const blockUpdate = async function (this: Query<unknown, IAuditLog>) {
  throw new Error("Audit logs are immutable and cannot be updated");
};

// ✅ SINGLE REGEX — avoids ALL overload conflicts
auditSchema.pre(
  /^(updateOne|updateMany|findOneAndUpdate|replaceOne|findOneAndReplace)$/,
  blockUpdate
);

/* deleteOne and deleteMany are intentionally NOT blocked here —
   you need them for legal-compliance retention purges (e.g. GDPR
   right-to-be-forgotten). Restrict via service-layer + RBAC instead. */

/* =====================================================
   STATIC METHODS
===================================================== */

auditSchema.statics.findByOrg = function (
  this: IAuditLogModel,
  orgId,
  opts = {}
) {
  const query: any = { organizationId: orgId };
  if (opts.before)   query.createdAt = { $lt: opts.before };
  if (opts.severity) query.severity  = opts.severity;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(opts.limit ?? 100, 1000))
    .lean<AuditLogDocument[]>();
};

auditSchema.statics.findByResource = function (
  this: IAuditLogModel,
  resource,
  resourceId
) {
  return this.find({ resource, resourceId })
    .sort({ createdAt: -1 })
    .lean<AuditLogDocument[]>();
};

auditSchema.statics.findCriticalEvents = function (
  this: IAuditLogModel,
  orgId,
  since
) {
  const query: any = {
    organizationId: orgId,
    severity: "critical",
  };
  if (since) query.createdAt = { $gte: since };

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean<AuditLogDocument[]>();
};

/* =====================================================
   COMPOUND INDEXES — built for real audit query patterns
===================================================== */

// Most common: org-scoped activity timeline
auditSchema.index({ organizationId: 1, createdAt: -1 });

// User activity feed ("what has this user done")
auditSchema.index({ userId: 1, createdAt: -1 });

// Per-resource history ("show me everything that happened to this deal")
auditSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

// Org-scoped resource history (tenant-safe)
auditSchema.index({ organizationId: 1, resource: 1, resourceId: 1, createdAt: -1 });

// Critical events dashboard
auditSchema.index({ organizationId: 1, severity: 1, createdAt: -1 });

// Failed/denied event monitoring (security ops)
auditSchema.index({ organizationId: 1, outcome: 1, createdAt: -1 });

// Action filtering ("show me all DELETEs in the last 30 days")
auditSchema.index({ organizationId: 1, action: 1, createdAt: -1 });

// Actor-type filtering ("show me all AI-triggered events")
auditSchema.index({ organizationId: 1, actorType: 1, createdAt: -1 });

// IP forensics — partial index, only when populated
auditSchema.index(
  { "requestContext.ipAddress": 1, createdAt: -1 },
  { partialFilterExpression: { "requestContext.ipAddress": { $exists: true } } }
);

/* =====================================================
   TTL — optional auto-purge for retention compliance
   Uncomment when legal has confirmed your retention policy.
===================================================== */

// auditSchema.index(
//   { createdAt: 1 },
//   { expireAfterSeconds: 60 * 60 * 24 * 365 * 7 } // 7 years (SOC2/SOX standard)
// );

/* =====================================================
   MODEL EXPORT (HMR-safe)
===================================================== */

const AuditLog: IAuditLogModel =
  (mongoose.models.AuditLog as IAuditLogModel | undefined) ??
  mongoose.model<IAuditLog, IAuditLogModel>("AuditLog", auditSchema);

export default AuditLog;
