// intelligenceSettings.model.ts
import mongoose, {
  Schema,
  Model,
  Types,
  HydratedDocument,
} from "mongoose";

/* =====================================================
   TYPES
===================================================== */

export type IndustryPreset =
  | "default"
  | "saas_b2b"
  | "enterprise_software"
  | "fintech"
  | "manufacturing"
  | "real_estate"
  | "professional_services"
  | "ecommerce"
  | "healthcare"
  | "custom";

export type ForecastModel = "weighted_pipeline" | "best_case" | "commit" | "ai_blended";

export interface IRuleOverride {
  ruleCode: string;       // e.g. "stale_deal", "stage_stagnation"
  enabled: boolean;
  customWeight?: number;  // optional weight override (0-100)
  customThreshold?: number; // optional threshold override (rule-specific)
}

export interface INotificationPreferences {
  emailDigest: boolean;
  emailDigestFrequency: "daily" | "weekly" | "off";
  inAppNotifications: boolean;
  slackWebhookUrl?: string | null;
  alertOnCritical: boolean;
  alertOnHighRisk: boolean;
  quietHoursStart?: string | null; // "22:00"
  quietHoursEnd?: string | null;   // "08:00"
  timezone?: string;               // "Asia/Kolkata"
}

/* ================= MAIN INTERFACE ================= */

export interface IIntelligenceSettings {
  /* Scope — supports both new org model and legacy tenant ref */
  organizationId: Types.ObjectId;

  /* Preset — one-click tuning for common industries */
  industryPreset: IndustryPreset;

  /* ── Risk engine thresholds ── */
  stallDaysThreshold: number;          // days of inactivity before flagging stale
  activitySpikeThreshold: number;      // activity count threshold for engagement
  fastMoveDaysWindow: number;          // days to detect rapid stage progression
  stageStagnationMultiplier: number;   // ratio above team avg to flag stagnant
  closeDateGracePeriodDays: number;    // grace period before flagging overdue

  /* ── Scoring thresholds ── */
  highValueMultiplier: number;         // multiplier of avg deal size = high value
  hotScoreThreshold: number;           // score above which lead is "hot"
  coldScoreThreshold: number;          // score below which lead is "cold"
  riskCriticalThreshold: number;       // risk score → critical (default 70)
  riskHighThreshold: number;           // risk score → high (default 50)
  riskMediumThreshold: number;         // risk score → medium (default 30)

  /* ── Forecast settings ── */
  forecastModel: ForecastModel;
  forecastConfidenceThreshold: number; // minimum probability for "commit" bucket
  forecastBestCaseThreshold: number;   // minimum probability for "best case"

  /* ── Per-rule overrides ── */
  ruleOverrides: IRuleOverride[];

  /* ── Notification preferences ── */
  notifications: INotificationPreferences;

  /* ── Engine behavior ── */
  enableAutoRecalculation: boolean;
  recalculationIntervalHours: number;  // how often the cron runs
  enableAIRecommendations: boolean;
  enableCompetitorAnalysis: boolean;
  enableForecastAdjustment: boolean;

  /* ── Audit ── */
  lastUpdatedBy?: Types.ObjectId | null;
  version: number;                     // optimistic concurrency

  /* Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/* ================= INSTANCE METHODS ================= */

export interface IIntelligenceSettingsMethods {
  isRuleEnabled(ruleCode: string): boolean;
  getRuleOverride(ruleCode: string): IRuleOverride | undefined;
  applyPreset(preset: IndustryPreset): void;
}

export type IntelligenceSettingsDocument = HydratedDocument<
  IIntelligenceSettings,
  IIntelligenceSettingsMethods
>;

/* ================= STATIC METHODS ================= */

export interface IIntelligenceSettingsModel
  extends Model<IIntelligenceSettings, {}, IIntelligenceSettingsMethods> {
  getOrCreateForOrg(
    organizationId: Types.ObjectId | string
  ): Promise<IntelligenceSettingsDocument>;
  applyPresetForOrg(
    organizationId: Types.ObjectId | string,
    preset: IndustryPreset,
    updatedBy: Types.ObjectId | string
  ): Promise<IntelligenceSettingsDocument>;
}

/* =====================================================
   SUB-SCHEMAS
===================================================== */

const RuleOverrideSchema = new Schema<IRuleOverride>(
  {
    ruleCode: { type: String, required: true, trim: true, maxlength: 100 },
    enabled:  { type: Boolean, required: true, default: true },
    customWeight: {
      type: Number,
      min: 0,
      max: 100,
    },
    customThreshold: { type: Number },
  },
  { _id: false }
);

const NotificationPreferencesSchema = new Schema<INotificationPreferences>(
  {
    emailDigest: { type: Boolean, default: true },
    emailDigestFrequency: {
      type: String,
      enum: ["daily", "weekly", "off"],
      default: "daily",
    },
    inAppNotifications: { type: Boolean, default: true },
    slackWebhookUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    alertOnCritical: { type: Boolean, default: true },
    alertOnHighRisk: { type: Boolean, default: true },
    quietHoursStart: { type: String, default: null, maxlength: 5 },
    quietHoursEnd:   { type: String, default: null, maxlength: 5 },
    timezone: { type: String, default: "Asia/Kolkata", maxlength: 50 },
  },
  { _id: false }
);

/* =====================================================
   PRESET CONFIGURATIONS
   Industry-tuned defaults. New orgs pick a preset → instant smart tuning.
===================================================== */

const INDUSTRY_PRESETS: Record<
  IndustryPreset,
  Partial<IIntelligenceSettings>
> = {
  default: {
    stallDaysThreshold: 7,
    activitySpikeThreshold: 5,
    fastMoveDaysWindow: 3,
    stageStagnationMultiplier: 1.5,
    closeDateGracePeriodDays: 3,
    highValueMultiplier: 1.5,
    hotScoreThreshold: 75,
    coldScoreThreshold: 30,
    riskCriticalThreshold: 70,
    riskHighThreshold: 50,
    riskMediumThreshold: 30,
    forecastConfidenceThreshold: 70,
    forecastBestCaseThreshold: 40,
  },
  saas_b2b: {
    stallDaysThreshold: 5,           // SaaS moves fast
    activitySpikeThreshold: 7,
    fastMoveDaysWindow: 2,
    stageStagnationMultiplier: 1.3,
    closeDateGracePeriodDays: 2,
    highValueMultiplier: 2.0,
    hotScoreThreshold: 70,
    coldScoreThreshold: 25,
    riskCriticalThreshold: 65,
    riskHighThreshold: 45,
    riskMediumThreshold: 25,
    forecastConfidenceThreshold: 75,
    forecastBestCaseThreshold: 50,
  },
  enterprise_software: {
    stallDaysThreshold: 14,          // long cycles
    activitySpikeThreshold: 4,
    fastMoveDaysWindow: 7,
    stageStagnationMultiplier: 2.0,
    closeDateGracePeriodDays: 7,
    highValueMultiplier: 3.0,
    hotScoreThreshold: 80,
    coldScoreThreshold: 35,
    riskCriticalThreshold: 75,
    riskHighThreshold: 55,
    riskMediumThreshold: 35,
    forecastConfidenceThreshold: 65,
    forecastBestCaseThreshold: 35,
  },
  fintech: {
    stallDaysThreshold: 10,
    activitySpikeThreshold: 6,
    fastMoveDaysWindow: 5,
    stageStagnationMultiplier: 1.8,
    closeDateGracePeriodDays: 5,
    highValueMultiplier: 2.5,
    hotScoreThreshold: 75,
    coldScoreThreshold: 30,
    riskCriticalThreshold: 70,
    riskHighThreshold: 50,
    riskMediumThreshold: 30,
    forecastConfidenceThreshold: 70,
    forecastBestCaseThreshold: 40,
  },
  manufacturing: {
    stallDaysThreshold: 21,          // very long cycles
    activitySpikeThreshold: 3,
    fastMoveDaysWindow: 14,
    stageStagnationMultiplier: 2.5,
    closeDateGracePeriodDays: 14,
    highValueMultiplier: 4.0,
    hotScoreThreshold: 80,
    coldScoreThreshold: 40,
    riskCriticalThreshold: 70,
    riskHighThreshold: 50,
    riskMediumThreshold: 30,
    forecastConfidenceThreshold: 60,
    forecastBestCaseThreshold: 30,
  },
  real_estate: {
    stallDaysThreshold: 14,
    activitySpikeThreshold: 4,
    fastMoveDaysWindow: 7,
    stageStagnationMultiplier: 2.0,
    closeDateGracePeriodDays: 10,
    highValueMultiplier: 3.0,
    hotScoreThreshold: 75,
    coldScoreThreshold: 35,
    riskCriticalThreshold: 70,
    riskHighThreshold: 50,
    riskMediumThreshold: 30,
    forecastConfidenceThreshold: 65,
    forecastBestCaseThreshold: 35,
  },
  professional_services: {
    stallDaysThreshold: 10,
    activitySpikeThreshold: 5,
    fastMoveDaysWindow: 5,
    stageStagnationMultiplier: 1.7,
    closeDateGracePeriodDays: 5,
    highValueMultiplier: 2.0,
    hotScoreThreshold: 75,
    coldScoreThreshold: 30,
    riskCriticalThreshold: 70,
    riskHighThreshold: 50,
    riskMediumThreshold: 30,
    forecastConfidenceThreshold: 70,
    forecastBestCaseThreshold: 40,
  },
  ecommerce: {
    stallDaysThreshold: 3,           // very short cycles
    activitySpikeThreshold: 10,
    fastMoveDaysWindow: 1,
    stageStagnationMultiplier: 1.2,
    closeDateGracePeriodDays: 1,
    highValueMultiplier: 1.5,
    hotScoreThreshold: 65,
    coldScoreThreshold: 25,
    riskCriticalThreshold: 60,
    riskHighThreshold: 40,
    riskMediumThreshold: 20,
    forecastConfidenceThreshold: 75,
    forecastBestCaseThreshold: 50,
  },
  healthcare: {
    stallDaysThreshold: 14,
    activitySpikeThreshold: 4,
    fastMoveDaysWindow: 7,
    stageStagnationMultiplier: 2.0,
    closeDateGracePeriodDays: 10,
    highValueMultiplier: 2.5,
    hotScoreThreshold: 75,
    coldScoreThreshold: 30,
    riskCriticalThreshold: 70,
    riskHighThreshold: 50,
    riskMediumThreshold: 30,
    forecastConfidenceThreshold: 65,
    forecastBestCaseThreshold: 35,
  },
  custom: {
    // Custom = user defines everything; no preset values applied.
  },
};

export { INDUSTRY_PRESETS };

/* =====================================================
   MAIN SCHEMA
===================================================== */

const intelligenceSettingsSchema = new Schema<
  IIntelligenceSettings,
  IIntelligenceSettingsModel,
  IIntelligenceSettingsMethods
>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },

    industryPreset: {
      type: String,
      enum: [
        "default",
        "saas_b2b",
        "enterprise_software",
        "fintech",
        "manufacturing",
        "real_estate",
        "professional_services",
        "ecommerce",
        "healthcare",
        "custom",
      ] as IndustryPreset[],
      default: "default",
      index: true,
    },

    /* ── Risk engine thresholds ── */
    stallDaysThreshold: {
      type: Number,
      default: 7,
      min: 1,
      max: 365,
    },
    activitySpikeThreshold: {
      type: Number,
      default: 5,
      min: 1,
      max: 100,
    },
    fastMoveDaysWindow: {
      type: Number,
      default: 3,
      min: 1,
      max: 90,
    },
    stageStagnationMultiplier: {
      type: Number,
      default: 1.5,
      min: 1,
      max: 10,
    },
    closeDateGracePeriodDays: {
      type: Number,
      default: 3,
      min: 0,
      max: 90,
    },

    /* ── Scoring thresholds ── */
    highValueMultiplier: {
      type: Number,
      default: 1.5,
      min: 1,
      max: 20,
    },
    hotScoreThreshold: {
      type: Number,
      default: 75,
      min: 0,
      max: 100,
    },
    coldScoreThreshold: {
      type: Number,
      default: 30,
      min: 0,
      max: 100,
    },
    riskCriticalThreshold: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
    riskHighThreshold: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    riskMediumThreshold: {
      type: Number,
      default: 30,
      min: 0,
      max: 100,
    },

    /* ── Forecast settings ── */
    forecastModel: {
      type: String,
      enum: ["weighted_pipeline", "best_case", "commit", "ai_blended"] as ForecastModel[],
      default: "weighted_pipeline",
    },
    forecastConfidenceThreshold: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
    forecastBestCaseThreshold: {
      type: Number,
      default: 40,
      min: 0,
      max: 100,
    },

    /* ── Per-rule overrides ── */
    ruleOverrides: {
      type: [RuleOverrideSchema],
      default: [],
      validate: {
        validator: (arr: IRuleOverride[]) => arr.length <= 100,
        message: "Maximum 100 rule overrides allowed",
      },
    },

    /* ── Notification preferences ── */
    notifications: {
      type: NotificationPreferencesSchema,
      default: () => ({}),
    },

    /* ── Engine behavior ── */
    enableAutoRecalculation: { type: Boolean, default: true },
    recalculationIntervalHours: {
      type: Number,
      default: 24,
      min: 1,
      max: 168, // weekly max
    },
    enableAIRecommendations:    { type: Boolean, default: true },
    enableCompetitorAnalysis:   { type: Boolean, default: true },
    enableForecastAdjustment:   { type: Boolean, default: true },

    /* ── Audit ── */
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
    minimize: false,
    optimisticConcurrency: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* =====================================================
   VALIDATION HOOKS
===================================================== */

intelligenceSettingsSchema.pre("validate", function (
  this: IntelligenceSettingsDocument
) {
  // Hot threshold must be > cold threshold
  if (this.hotScoreThreshold <= this.coldScoreThreshold) {
    this.invalidate(
      "hotScoreThreshold",
      "Hot score threshold must be greater than cold score threshold"
    );
  }

  // Risk thresholds must be in correct order
  if (this.riskCriticalThreshold <= this.riskHighThreshold) {
    this.invalidate(
      "riskCriticalThreshold",
      "Critical threshold must be greater than high threshold"
    );
  }
  if (this.riskHighThreshold <= this.riskMediumThreshold) {
    this.invalidate(
      "riskHighThreshold",
      "High threshold must be greater than medium threshold"
    );
  }

  // Forecast thresholds: confidence (commit) > best case
  if (this.forecastConfidenceThreshold <= this.forecastBestCaseThreshold) {
    this.invalidate(
      "forecastConfidenceThreshold",
      "Commit threshold must be greater than best case threshold"
    );
  }
});

intelligenceSettingsSchema.pre<IntelligenceSettingsDocument>(
  "save",
  async function () {
    // Bump version on any modification (optimistic concurrency)
    if (!this.isNew && this.isModified()) {
      this.version = (this.version ?? 1) + 1;
    }
  }
);

/* =====================================================
   INSTANCE METHODS
===================================================== */

intelligenceSettingsSchema.methods.isRuleEnabled = function (
  this: IntelligenceSettingsDocument,
  ruleCode: string
): boolean {
  const override = this.ruleOverrides.find(r => r.ruleCode === ruleCode);
  // Default = enabled if no override
  return override ? override.enabled : true;
};

intelligenceSettingsSchema.methods.getRuleOverride = function (
  this: IntelligenceSettingsDocument,
  ruleCode: string
): IRuleOverride | undefined {
  return this.ruleOverrides.find(r => r.ruleCode === ruleCode);
};

intelligenceSettingsSchema.methods.applyPreset = function (
  this: IntelligenceSettingsDocument,
  preset: IndustryPreset
): void {
  const config = INDUSTRY_PRESETS[preset];
  if (!config) return;

  this.industryPreset = preset;
  Object.assign(this, config);
};

/* =====================================================
   STATIC METHODS
===================================================== */

intelligenceSettingsSchema.statics.getOrCreateForOrg = async function (
  this: IIntelligenceSettingsModel,
  organizationId
): Promise<IntelligenceSettingsDocument> {
  let settings = await this.findOne({ organizationId });
  if (settings) return settings;

  settings = await this.create({
    organizationId,
    industryPreset: "default",
  });
  return settings;
};

intelligenceSettingsSchema.statics.applyPresetForOrg = async function (
  this: IIntelligenceSettingsModel,
  organizationId,
  preset,
  updatedBy
): Promise<IntelligenceSettingsDocument> {
  const settings = await this.findOne({ organizationId });
  if (!settings) {
    throw new Error("Intelligence settings not found for organization");
  }

  settings.applyPreset(preset);
  settings.lastUpdatedBy =
    typeof updatedBy === "string"
      ? new mongoose.Types.ObjectId(updatedBy)
      : updatedBy;

  await settings.save();
  return settings;
};

/* =====================================================
   INDEXES
===================================================== */

// organizationId already has unique index from field definition.
// Add a secondary index for industry-preset analytics.
intelligenceSettingsSchema.index({ industryPreset: 1 });

/* =====================================================
   MODEL EXPORT (HMR-safe)
===================================================== */

const IntelligenceSettings: IIntelligenceSettingsModel =
  (mongoose.models.IntelligenceSettings as
    | IIntelligenceSettingsModel
    | undefined) ??
  mongoose.model<IIntelligenceSettings, IIntelligenceSettingsModel>(
    "IntelligenceSettings",
    intelligenceSettingsSchema
  );

export default IntelligenceSettings;