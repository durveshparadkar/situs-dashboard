// deal.model.ts
import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

/* ================= TYPES ================= */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type DealStatus = "open" | "won" | "lost" | "stalled" | "abandoned";

export type DealSource =
  | "inbound"
  | "outbound"
  | "referral"
  | "marketing"
  | "partner"
  | "event"
  | "other";

export type DealPriority = "low" | "medium" | "high" | "urgent";

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD";

/* ── Embedded sub-documents ── */

export interface IStageHistory {
  stageId: Types.ObjectId;
  stageName?: string;
  enteredAt: Date;
  exitedAt?: Date | null;
  durationMs?: number;
  changedBy: Types.ObjectId;
}

export interface IRiskFactor {
  factor: string;          // e.g. "no_activity_14d"
  weight: number;          // contribution to riskScore
  detectedAt: Date;
  resolved?: boolean;
}

export interface ICompetitor {
  name: string;
  strength?: "weak" | "neutral" | "strong";
  notes?: string;
}

export interface IDeal {
  /* Core */
  title: string;
  description?: string;
  value: number;
  currency: Currency;
  valueInBaseCurrency?: number;          // normalized for cross-currency reports

  /* Ownership & scope */
  organizationId: Types.ObjectId;
  assignedTo: Types.ObjectId;
  createdBy: Types.ObjectId;
  lastUpdatedBy?: Types.ObjectId;
  collaborators: Types.ObjectId[];       // additional team members with access

  /* Relationships */
  lead?: Types.ObjectId | null;
  contactIds: Types.ObjectId[];
  accountId?: Types.ObjectId | null;

  /* Pipeline */
  pipelineId: Types.ObjectId;
  stageId: Types.ObjectId;
  stageHistory: IStageHistory[];
  probability: number;
  expectedCloseDate?: Date | null;
  actualCloseDate?: Date | null;

  /* Status & lifecycle */
  status: DealStatus;
  priority: DealPriority;
  source: DealSource;
  lostReason?: string;
  wonReason?: string;
  competitors: ICompetitor[];
  tags: string[];

  /* Activity */
  activityCount: number;
  lastActivityAt: Date;
  lastContactedAt?: Date | null;
  nextFollowUpAt?: Date | null;
  daysInCurrentStage: number;
  ageDays: number;                       // total days since creation

  /* Risk engine */
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: IRiskFactor[];
  riskCalculatedAt?: Date;

  /* Forecasting */
  forecastCategory?: "pipeline" | "best_case" | "commit" | "closed";
  weightedValue?: number;                // value * (probability / 100)

  /* Integrations */
  externalIds: {
    hubspotId?: string;
    salesforceId?: string;
    crmSource?: "hubspot" | "salesforce" | "manual" | "import";
  };

  /* Soft delete & audit */
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;

  /* Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/* ── Instance methods on the document ── */
export interface IDealMethods {
  computeRiskLevel(): RiskLevel;
  isStale(thresholdDays?: number): boolean;
  recalculateWeightedValue(): number;
}

export type DealDocument = HydratedDocument<IDeal, IDealMethods>;

/* ── Static methods on the model ── */
export interface IDealModel extends Model<IDeal, {}, IDealMethods> {
  findActiveByOrg(orgId: Types.ObjectId | string): Promise<DealDocument[]>;
  findAtRisk(orgId: Types.ObjectId | string): Promise<DealDocument[]>;
}

/* ================= HELPERS ================= */

function calcRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/* ================= SUB-SCHEMAS ================= */

const StageHistorySchema = new Schema<IStageHistory>(
  {
    stageId:    { type: Schema.Types.ObjectId, required: true },
    stageName:  { type: String, trim: true },
    enteredAt:  { type: Date, required: true, default: Date.now },
    exitedAt:   { type: Date, default: null },
    durationMs: { type: Number, default: 0, min: 0 },
    changedBy:  { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false }
);

const RiskFactorSchema = new Schema<IRiskFactor>(
  {
    factor:     { type: String, required: true, trim: true },
    weight:     { type: Number, required: true, min: 0, max: 100 },
    detectedAt: { type: Date, required: true, default: Date.now },
    resolved:   { type: Boolean, default: false },
  },
  { _id: false }
);

const CompetitorSchema = new Schema<ICompetitor>(
  {
    name:     { type: String, required: true, trim: true },
    strength: {
      type: String,
      enum: ["weak", "neutral", "strong"],
      default: "neutral",
    },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

/* ================= MAIN SCHEMA ================= */

const DealSchema = new Schema<IDeal, IDealModel, IDealMethods>(
  {
    /* ── Core ── */
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      default: "Untitled Deal",
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    currency: {
      type: String,
      enum: ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as Currency[],
      default: "INR",
      uppercase: true,
      index: true,
    },
    valueInBaseCurrency: { type: Number, min: 0 },

    /* ── Ownership ── */
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    collaborators: [
      { type: Schema.Types.ObjectId, ref: "User" },
    ],

    /* ── Relationships ── */
    lead: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
    },
    contactIds: [
      { type: Schema.Types.ObjectId, ref: "Contact" },
    ],
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    /* ── Pipeline ── */
    pipelineId: {
      type: Schema.Types.ObjectId,
      ref: "Pipeline",
      required: true,
      index: true,
    },
    stageId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    stageHistory: { type: [StageHistorySchema], default: [] },
    probability: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      index: true,
    },
    expectedCloseDate: { type: Date, default: null, index: true },
    actualCloseDate:   { type: Date, default: null },

    /* ── Lifecycle ── */
    status: {
      type: String,
      enum: ["open", "won", "lost", "stalled", "abandoned"] as DealStatus[],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"] as DealPriority[],
      default: "medium",
      index: true,
    },
    source: {
      type: String,
      enum: ["inbound", "outbound", "referral", "marketing", "partner", "event", "other"] as DealSource[],
      default: "other",
      index: true,
    },
    lostReason: { type: String, trim: true, maxlength: 500 },
    wonReason:  { type: String, trim: true, maxlength: 500 },
    competitors: { type: [CompetitorSchema], default: [] },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => arr.length <= 20,
        message: "A deal can have at most 20 tags",
      },
    },

    /* ── Activity ── */
    activityCount:      { type: Number, default: 0, min: 0, index: true },
    lastActivityAt:     { type: Date,   default: Date.now, index: true },
    lastContactedAt:    { type: Date,   default: null },
    nextFollowUpAt:     { type: Date,   default: null, index: true },
    daysInCurrentStage: { type: Number, default: 0, min: 0 },
    ageDays:            { type: Number, default: 0, min: 0 },

    /* ── Risk ── */
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      index: true,
    },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"] as RiskLevel[],
      default: "low",
      index: true,
    },
    riskFactors:        { type: [RiskFactorSchema], default: [] },
    riskCalculatedAt:   { type: Date },

    /* ── Forecasting ── */
    forecastCategory: {
      type: String,
      enum: ["pipeline", "best_case", "commit", "closed"],
      default: "pipeline",
      index: true,
    },
    weightedValue: { type: Number, default: 0, min: 0 },

    /* ── Integrations ── */
    externalIds: {
      hubspotId:    { type: String, trim: true, index: true, sparse: true },
      salesforceId: { type: String, trim: true, index: true, sparse: true },
      crmSource: {
        type: String,
        enum: ["hubspot", "salesforce", "manual", "import"],
        default: "manual",
      },
    },

    /* ── Soft delete ── */
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/* ================= VIRTUALS ================= */

DealSchema.virtual("isStaleVirtual").get(function (this: DealDocument) {
  const days = (Date.now() - this.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
  return days > 14;
});

DealSchema.virtual("isClosed").get(function (this: DealDocument) {
  return this.status === "won" || this.status === "lost";
});

/* ================= INSTANCE METHODS ================= */

DealSchema.methods.computeRiskLevel = function (this: DealDocument): RiskLevel {
  return calcRiskLevel(this.riskScore);
};

DealSchema.methods.isStale = function (
  this: DealDocument,
  thresholdDays = 14
): boolean {
  const days = (Date.now() - this.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
  return days > thresholdDays;
};

DealSchema.methods.recalculateWeightedValue = function (
  this: DealDocument
): number {
  const weighted = this.value * (this.probability / 100);
  this.weightedValue = Math.round(weighted * 100) / 100;
  return this.weightedValue;
};

/* ================= STATIC METHODS ================= */

DealSchema.statics.findActiveByOrg = function (
  this: IDealModel,
  orgId: Types.ObjectId | string
) {
  return this.find({
    organizationId: orgId,
    isDeleted: false,
    status: "open",
  });
};

DealSchema.statics.findAtRisk = function (
  this: IDealModel,
  orgId: Types.ObjectId | string
) {
  return this.find({
    organizationId: orgId,
    isDeleted: false,
    status: "open",
    riskLevel: { $in: ["high", "critical"] },
  }).sort({ riskScore: -1 });
};

/* ================= HOOKS ================= */

DealSchema.pre("validate", function (this: DealDocument) {
  if (!this.title?.trim()) this.title = "Untitled Deal";
  if (this.value < 0) this.value = 0;
  this.probability = clamp(this.probability ?? 0, 0, 100);
  this.riskScore   = clamp(this.riskScore   ?? 0, 0, 100);
});

DealSchema.pre("save", function (this: DealDocument) {
  // Auto-derive risk level
  this.riskLevel = calcRiskLevel(this.riskScore);

  // Auto-compute weighted forecast value
  this.weightedValue = Math.round(this.value * (this.probability / 100) * 100) / 100;

  // Auto-compute age in days
  if (this.createdAt) {
    this.ageDays = Math.floor(
      (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Track stage transitions
  if (this.isModified("stageId")) {
    const last = this.stageHistory[this.stageHistory.length - 1];
    if (last && !last.exitedAt) {
      last.exitedAt  = new Date();
      last.durationMs = last.exitedAt.getTime() - last.enteredAt.getTime();
    }
    this.stageHistory.push({
      stageId:   this.stageId,
      enteredAt: new Date(),
      changedBy: this.lastUpdatedBy ?? this.createdBy,
    } as IStageHistory);
    this.daysInCurrentStage = 0;
  }

  // Set actualCloseDate when status flips to closed
  if (this.isModified("status")) {
    if ((this.status === "won" || this.status === "lost") && !this.actualCloseDate) {
      this.actualCloseDate = new Date();
    }
    if (this.status === "won")  this.forecastCategory = "closed";
    if (this.status === "lost") this.forecastCategory = "closed";
  }
});

/* ================= COMPOUND INDEXES ================= */

// Org-scoped operational queries
DealSchema.index({ organizationId: 1, isDeleted: 1, status: 1 });
DealSchema.index({ organizationId: 1, assignedTo: 1, status: 1 });
DealSchema.index({ organizationId: 1, pipelineId: 1, stageId: 1 });
DealSchema.index({ organizationId: 1, riskLevel: 1, riskScore: -1 });
DealSchema.index({ organizationId: 1, value: -1 });
DealSchema.index({ organizationId: 1, lastActivityAt: -1 });
DealSchema.index({ organizationId: 1, expectedCloseDate: 1 });
DealSchema.index({ organizationId: 1, forecastCategory: 1 });
DealSchema.index({ organizationId: 1, priority: 1 });

// Full-text search across title, description, tags
DealSchema.index(
  { title: "text", description: "text", tags: "text" },
  { name: "deal_text_search", weights: { title: 10, tags: 5, description: 1 } }
);

// CRM dedup
DealSchema.index(
  { organizationId: 1, "externalIds.hubspotId":    1 },
  { sparse: true }
);
DealSchema.index(
  { organizationId: 1, "externalIds.salesforceId": 1 },
  { sparse: true }
);

/* ================= MODEL ================= */

const Deal: IDealModel =
  (mongoose.models.Deal as IDealModel | undefined) ??
  mongoose.model<IDeal, IDealModel>("Deal", DealSchema);

export default Deal;