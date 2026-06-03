// entity.model.ts
import mongoose, {
  Schema,
  Model,
  Types,
  HydratedDocument,
} from "mongoose";

/* =====================================================
   ENUMS
===================================================== */

/**
 * Entity types — generic enough to cover the common B2B object model.
 * Add to this list as your product expands; do NOT use ad-hoc strings
 * elsewhere in the codebase.
 */
export const ENTITY_TYPES = [
  "generic",
  "account",
  "contact",
  "lead",
  "deal",
  "campaign",
  "product",
  "asset",
  "document",
  "task",
  "note",
  "custom",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_STATUSES = [
  "active",
  "archived",
  "draft",
  "pending",
] as const;

export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const ENTITY_VISIBILITY = [
  "private",        // owner only
  "team",           // owner's team
  "organization",   // entire org
  "public",         // visible without auth (rare — e.g. public landing page)
] as const;

export type EntityVisibility = (typeof ENTITY_VISIBILITY)[number];

/* =====================================================
   INTERFACES
===================================================== */

export interface IEntity {
  /* Scope */
  organizationId: Types.ObjectId;

  /* Core */
  title: string;
  description?: string;
  type: EntityType;
  status: EntityStatus;
  visibility: EntityVisibility;

  /* Ownership */
  ownerId: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;

  /* Categorization */
  tags: string[];
  category?: string;

  /* External reference (CRM integration) */
  externalIds?: {
    hubspot?: string;
    salesforce?: string;
    custom?: string;
  };

  /* Soft delete */
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;

  /* Audit */
  lastViewedAt?: Date | null;
  viewCount: number;

  /* Custom fields — for end-user extensibility */
  customFields?: Record<string, unknown>;

  /* Metadata */
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

/* ================= INSTANCE METHODS ================= */

export interface IEntityMethods {
  softDelete(userId: Types.ObjectId): Promise<void>;
  restore(): Promise<void>;
  recordView(): Promise<void>;
  isOwnedBy(userId: Types.ObjectId | string): boolean;
}

export type EntityDocument = HydratedDocument<IEntity, IEntityMethods>;

/* ================= STATIC METHODS ================= */

export interface IEntityModel extends Model<IEntity, {}, IEntityMethods> {
  findActive(
    organizationId: Types.ObjectId | string,
    filter?: Record<string, unknown>
  ): mongoose.Query<EntityDocument[], EntityDocument>;

  findByExternalId(
    organizationId: Types.ObjectId | string,
    source: "hubspot" | "salesforce" | "custom",
    externalId: string
  ): Promise<EntityDocument | null>;
}

/* =====================================================
   SUB-SCHEMAS
===================================================== */

const ExternalIdsSchema = new Schema(
  {
    hubspot:    { type: String, trim: true, maxlength: 200 },
    salesforce: { type: String, trim: true, maxlength: 200 },
    custom:     { type: String, trim: true, maxlength: 200 },
  },
  { _id: false }
);

/* =====================================================
   MAIN SCHEMA
===================================================== */

const entitySchema = new Schema<IEntity, IEntityModel, IEntityMethods>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: 1,
      maxlength: 300,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },

    type: {
      type: String,
      enum: ENTITY_TYPES,
      default: "generic",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ENTITY_STATUSES,
      default: "active",
      required: true,
      index: true,
    },

    visibility: {
      type: String,
      enum: ENTITY_VISIBILITY,
      default: "organization",
      required: true,
    },

    ownerId: {
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

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => arr.length <= 50,
        message: "An entity cannot have more than 50 tags",
      },
    },

    category: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    externalIds: { type: ExternalIdsSchema, default: () => ({}) },

    /* Soft delete */
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /* Audit */
    lastViewedAt: { type: Date, default: null },
    viewCount:    { type: Number, default: 0, min: 0 },

    /* Extensibility */
    customFields: { type: Schema.Types.Mixed, default: {} },
    metadata:     { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
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

/* =====================================================
   VIRTUALS
===================================================== */

entitySchema.virtual("isOrphaned").get(function (this: EntityDocument) {
  return !this.ownerId;
});

entitySchema.virtual("ageInDays").get(function (this: EntityDocument) {
  if (!this.createdAt) return 0;
  return Math.floor(
    (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
});

/* =====================================================
   INSTANCE METHODS
===================================================== */

entitySchema.methods.softDelete = async function (
  this: EntityDocument,
  userId: Types.ObjectId
): Promise<void> {
  if (this.isDeleted) return;
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  await this.save();
};

entitySchema.methods.restore = async function (
  this: EntityDocument
): Promise<void> {
  if (!this.isDeleted) return;
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  await this.save();
};

entitySchema.methods.recordView = async function (
  this: EntityDocument
): Promise<void> {
  this.lastViewedAt = new Date();
  this.viewCount = (this.viewCount ?? 0) + 1;
  await this.save();
};

entitySchema.methods.isOwnedBy = function (
  this: EntityDocument,
  userId: Types.ObjectId | string
): boolean {
  return this.ownerId.toString() === userId.toString();
};

/* =====================================================
   STATIC METHODS
===================================================== */

entitySchema.statics.findActive = function (
  this: IEntityModel,
  organizationId: Types.ObjectId | string,
  filter: Record<string, unknown> = {}
) {
  return this.find({
    organizationId,
    isDeleted: { $ne: true },
    ...filter,
  });
};

entitySchema.statics.findByExternalId = function (
  this: IEntityModel,
  organizationId: Types.ObjectId | string,
  source: "hubspot" | "salesforce" | "custom",
  externalId: string
) {
  return this.findOne({
    organizationId,
    isDeleted: { $ne: true },
    [`externalIds.${source}`]: externalId,
  });
};

/* =====================================================
   PRE-SAVE HOOKS
===================================================== */

/**
 * Normalize tags: trim, dedupe, lowercase, drop empty.
 */
entitySchema.pre("validate", function (this: EntityDocument) {
  if (Array.isArray(this.tags)) {
    const cleaned = this.tags
      .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
      .filter((t) => t.length > 0);
    this.tags = Array.from(new Set(cleaned));
  }
});

/* =====================================================
   COMPOUND INDEXES
===================================================== */

/* Most common: list entities for an org, filtered by type/status */
entitySchema.index(
  { organizationId: 1, type: 1, status: 1, createdAt: -1 },
  { name: "org_type_status_recent" }
);

/* Owner's entities */
entitySchema.index(
  { organizationId: 1, ownerId: 1, isDeleted: 1, updatedAt: -1 },
  { name: "org_owner_active_recent" }
);

/* Title text search (case-insensitive) */
entitySchema.index(
  { organizationId: 1, title: 1 },
  { name: "org_title", collation: { locale: "en", strength: 2 } }
);

/* External ID lookups (CRM sync) */
entitySchema.index(
  { organizationId: 1, "externalIds.hubspot": 1 },
  {
    name: "org_external_hubspot",
    sparse: true,
    partialFilterExpression: { "externalIds.hubspot": { $exists: true } },
  }
);
entitySchema.index(
  { organizationId: 1, "externalIds.salesforce": 1 },
  {
    name: "org_external_salesforce",
    sparse: true,
    partialFilterExpression: { "externalIds.salesforce": { $exists: true } },
  }
);

/* Tag-based filtering */
entitySchema.index(
  { organizationId: 1, tags: 1 },
  { name: "org_tags" }
);

/* Soft delete TTL — purge after 180 days */
entitySchema.index(
  { deletedAt: 1 },
  {
    expireAfterSeconds: 180 * 24 * 60 * 60,
    partialFilterExpression: { isDeleted: true },
    name: "ttl_deleted_entities",
  }
);

/* Full-text search across title, description, tags */
entitySchema.index(
  { title: "text", description: "text", tags: "text" },
  {
    weights: { title: 10, tags: 5, description: 1 },
    name: "entity_text_search",
  }
);

/* =====================================================
   MODEL EXPORT (HMR-safe)
===================================================== */

const Entity: IEntityModel =
  (mongoose.models.Entity as IEntityModel | undefined) ??
  mongoose.model<IEntity, IEntityModel>("Entity", entitySchema);

export default Entity;











