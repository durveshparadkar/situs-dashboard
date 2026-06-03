// entity.dto.ts
import { z } from "zod";
import mongoose from "mongoose";
import { ENTITY_TYPES, ENTITY_STATUSES, ENTITY_VISIBILITY, } from "./entity.model.js";
/* =====================================================
   ERRORS
===================================================== */
export class ValidationError extends Error {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    details;
    constructor(details) {
        super("Validation failed");
        this.name = "ValidationError";
        this.details = details;
    }
}
/* =====================================================
   PRIMITIVE SCHEMAS — reusable across DTOs
===================================================== */
/* MongoDB ObjectId — validates 24-char hex strings */
const objectIdSchema = z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
});
/* Tags — array of strings with normalization (trim, lowercase, dedupe) */
const tagsSchema = z
    .array(z
    .string()
    .trim()
    .min(1, "Tag cannot be empty")
    .max(50, "Tag cannot exceed 50 characters"))
    .max(50, "Cannot have more than 50 tags")
    .transform((tags) => {
    const cleaned = tags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);
    return Array.from(new Set(cleaned));
});
/* External IDs — for CRM integration (HubSpot, Salesforce) */
const externalIdsSchema = z
    .object({
    hubspot: z.string().trim().max(200).optional(),
    salesforce: z.string().trim().max(200).optional(),
    custom: z.string().trim().max(200).optional(),
})
    .strict();
/* Custom fields — arbitrary JSON for end-user extensibility */
const recordSchema = z.record(z.string(), z.unknown());
/* ISO date — accepts strings or Date objects, normalizes to Date */
const isoDateSchema = z
    .union([z.string().datetime(), z.string().date(), z.date()])
    .transform((v) => (v instanceof Date ? v : new Date(v)))
    .refine((d) => !isNaN(d.getTime()), { message: "Invalid date" });
/* =====================================================
   ENUM SCHEMAS — derived from model constants
===================================================== */
const entityTypeSchema = z.enum(ENTITY_TYPES);
const entityStatusSchema = z.enum(ENTITY_STATUSES);
const entityVisibilitySchema = z.enum(ENTITY_VISIBILITY);
/* =====================================================
   CREATE ENTITY DTO
===================================================== */
export const createEntitySchema = z
    .object({
    /* Required */
    title: z
        .string()
        .trim()
        .min(1, "Title is required")
        .max(300, "Title cannot exceed 300 characters"),
    /* Optional core */
    description: z
        .string()
        .trim()
        .max(5000, "Description cannot exceed 5000 characters")
        .optional(),
    type: entityTypeSchema.optional(),
    status: entityStatusSchema.optional(),
    visibility: entityVisibilitySchema.optional(),
    /* Optional categorization */
    tags: tagsSchema.optional(),
    category: z.string().trim().max(100).optional(),
    /* Ownership — server typically sets this from req.user, but allow override
       for admin tools (the controller should reject this for non-admins) */
    ownerId: objectIdSchema.optional(),
    /* External integration */
    externalIds: externalIdsSchema.optional(),
    /* Extensibility */
    customFields: recordSchema.optional(),
    metadata: recordSchema.optional(),
})
    .strict();
/* =====================================================
   UPDATE ENTITY DTO
   All fields optional, but at least one must be provided.
===================================================== */
export const updateEntitySchema = z
    .object({
    title: z
        .string()
        .trim()
        .min(1, "Title cannot be empty")
        .max(300, "Title cannot exceed 300 characters")
        .optional(),
    description: z
        .string()
        .trim()
        .max(5000, "Description cannot exceed 5000 characters")
        .optional(),
    type: entityTypeSchema.optional(),
    status: entityStatusSchema.optional(),
    visibility: entityVisibilitySchema.optional(),
    tags: tagsSchema.optional(),
    category: z.string().trim().max(100).optional(),
    ownerId: objectIdSchema.optional(),
    externalIds: externalIdsSchema.optional(),
    customFields: recordSchema.optional(),
    metadata: recordSchema.optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
    path: [],
});
/* =====================================================
   LIST ENTITIES QUERY DTO
===================================================== */
const SORTABLE_FIELDS = [
    "createdAt",
    "updatedAt",
    "title",
    "type",
    "status",
    "lastViewedAt",
    "viewCount",
];
/**
 * Coerce string query params (from URL) into typed values.
 * ?page=2 arrives as the string "2" — Zod's coerce handles this.
 */
export const listEntitiesQuerySchema = z
    .object({
    /* Pagination */
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    /* Search */
    search: z.string().trim().max(200).optional(),
    /* Filters — accept single value or comma-separated list,
       transform into array for consistent service handling */
    type: z
        .union([entityTypeSchema, z.array(entityTypeSchema)])
        .optional(),
    status: z
        .union([entityStatusSchema, z.array(entityStatusSchema)])
        .optional(),
    ownerId: objectIdSchema.optional(),
    category: z.string().trim().max(100).optional(),
    visibility: entityVisibilitySchema.optional(),
    /* Tag filter — comma-separated string OR array */
    tags: z
        .union([z.string(), z.array(z.string())])
        .transform((v) => (Array.isArray(v) ? v : v.split(",")))
        .pipe(z
        .array(z
        .string()
        .trim()
        .toLowerCase()
        .min(1))
        .max(50))
        .optional(),
    /* Date range */
    createdAfter: isoDateSchema.optional(),
    createdBefore: isoDateSchema.optional(),
    /* Sort */
    sortBy: z.enum(SORTABLE_FIELDS).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    /* Admin flag — only honored if controller checks role */
    includeDeleted: z.coerce.boolean().optional(),
})
    .strict()
    .refine((data) => {
    // Date range sanity check
    if (data.createdAfter && data.createdBefore) {
        return data.createdAfter.getTime() < data.createdBefore.getTime();
    }
    return true;
}, {
    message: "createdAfter must be before createdBefore",
    path: ["createdAfter"],
})
    .refine((data) => {
    // Cap windows at 5 years — DoS prevention
    if (data.createdAfter && data.createdBefore) {
        const maxMs = 5 * 365 * 24 * 60 * 60 * 1000;
        return data.createdBefore.getTime() - data.createdAfter.getTime() <= maxMs;
    }
    return true;
}, {
    message: "Date range cannot exceed 5 years",
    path: ["createdBefore"],
});
/* =====================================================
   BULK CREATE DTO
===================================================== */
export const bulkCreateEntitiesSchema = z
    .object({
    entities: z
        .array(createEntitySchema)
        .min(1, "At least one entity is required")
        .max(1000, "Cannot bulk-create more than 1000 entities at once"),
})
    .strict();
/* =====================================================
   EXTERNAL ID LOOKUP DTO
===================================================== */
export const findByExternalIdSchema = z
    .object({
    source: z.enum(["hubspot", "salesforce", "custom"]),
    externalId: z
        .string()
        .trim()
        .min(1, "External ID is required")
        .max(200, "External ID cannot exceed 200 characters"),
})
    .strict();
/* =====================================================
   GENERIC RUNNER
   Single point where Zod errors are converted to your structured
   ValidationError — used by all validators in this file.
===================================================== */
function runSchema(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const details = result.error.issues.map((e) => ({
            field: e.path.length ? e.path.join(".") : "(root)",
            message: e.message,
        }));
        throw new ValidationError(details);
    }
    return result.data;
}
/* =====================================================
   PUBLIC VALIDATOR FUNCTIONS
===================================================== */
export const validateCreateEntity = (data) => runSchema(createEntitySchema, data);
export const validateUpdateEntity = (data) => runSchema(updateEntitySchema, data);
export const validateListEntitiesQuery = (data) => runSchema(listEntitiesQuerySchema, data);
export const validateBulkCreateEntities = (data) => runSchema(bulkCreateEntitiesSchema, data);
export const validateFindByExternalId = (data) => runSchema(findByExternalIdSchema, data);
/* =====================================================
   BACKWARDS-COMPATIBLE EXPORTS
   Some older code imports schema names directly. Keep these as aliases
   so removing them isn't an immediate refactor blocker.
===================================================== */
export const querySchema = listEntitiesQuerySchema;
//# sourceMappingURL=entity.dto.js.map