import { z } from "zod";
import mongoose from "mongoose";
/* ================= ERROR ================= */
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
/* ================= REUSABLE PRIMITIVES ================= */
const objectIdSchema = z
    .string()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid ObjectId format",
});
const currencySchema = z.enum(["INR", "USD", "EUR", "GBP", "AED", "SGD"]);
const dealStatusSchema = z.enum([
    "open",
    "won",
    "lost",
    "stalled",
    "abandoned",
]);
const dealPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const dealSourceSchema = z.enum([
    "inbound",
    "outbound",
    "referral",
    "marketing",
    "partner",
    "event",
    "other",
]);
const isoDateSchema = z
    .union([z.string(), z.date()])
    .transform((val) => (val instanceof Date ? val : new Date(val)));
const tagsSchema = z
    .array(z.string().trim().min(1).max(40))
    .max(20, "Maximum 20 tags allowed")
    .optional();
const competitorSchema = z.object({
    name: z.string().trim().min(1).max(120),
    strength: z.enum(["weak", "neutral", "strong"]).optional(),
    notes: z.string().trim().max(500).optional(),
});
/* ================= CREATE DEAL ================= */
export const createDealSchema = z.object({
    title: z
        .string({ message: "Title is required" })
        .trim()
        .min(1, "Title cannot be empty")
        .max(200, "Title cannot exceed 200 characters"),
    description: z.string().trim().max(5000).optional(),
    value: z
        .number({ message: "Value must be a number" })
        .nonnegative("Value cannot be negative")
        .finite("Value must be a finite number")
        .max(1_000_000_000_000, "Value exceeds maximum allowed"),
    currency: currencySchema.optional().default("INR"),
    pipelineId: objectIdSchema.optional(),
    stageId: objectIdSchema.optional(),
    probability: z.number().min(0).max(100).optional(),
    lead: objectIdSchema.optional().nullable(),
    accountId: objectIdSchema.optional().nullable(),
    contactIds: z.array(objectIdSchema).max(50).optional(),
    priority: dealPrioritySchema.optional().default("medium"),
    source: dealSourceSchema.optional().default("other"),
    expectedCloseDate: isoDateSchema.optional().nullable(),
    tags: tagsSchema,
    competitors: z.array(competitorSchema).max(10).optional(),
}).strict();
/* ================= UPDATE DEAL ================= */
export const updateDealSchema = z
    .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    value: z
        .number()
        .nonnegative("Value cannot be negative")
        .finite()
        .max(1_000_000_000_000)
        .optional(),
    currency: currencySchema.optional(),
    pipelineId: objectIdSchema.optional(),
    stageId: objectIdSchema.optional(),
    probability: z.number().min(0).max(100).optional(),
    status: dealStatusSchema.optional(),
    priority: dealPrioritySchema.optional(),
    source: dealSourceSchema.optional(),
    expectedCloseDate: isoDateSchema.optional().nullable(),
    tags: tagsSchema,
    competitors: z.array(competitorSchema).max(10).optional(),
    lostReason: z.string().trim().max(500).optional(),
    wonReason: z.string().trim().max(500).optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
/* ================= STAGE TRANSITION ================= */
export const updateStageSchema = z
    .object({
    stage: objectIdSchema,
})
    .strict();
/* ================= QUERY FILTERS ================= */
export const dealFiltersSchema = z
    .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    stage: objectIdSchema.optional(),
    pipelineId: objectIdSchema.optional(),
    ownerId: objectIdSchema.optional(),
    status: dealStatusSchema.optional(),
    priority: dealPrioritySchema.optional(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
    sortBy: z
        .enum([
        "createdAt",
        "updatedAt",
        "value",
        "probability",
        "riskScore",
        "lastActivityAt",
        "expectedCloseDate",
    ])
        .optional()
        .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
    search: z.string().trim().min(1).max(200).optional(),
    minValue: z.coerce.number().nonnegative().optional(),
    maxValue: z.coerce.number().nonnegative().optional(),
})
    .strict()
    .refine((data) => data.minValue === undefined ||
    data.maxValue === undefined ||
    data.minValue <= data.maxValue, { message: "minValue cannot be greater than maxValue", path: ["minValue"] });
/* ================= BULK UPDATE ================= */
export const bulkUpdateStageSchema = z
    .object({
    dealIds: z
        .array(objectIdSchema)
        .min(1, "At least one deal ID is required")
        .max(500, "Cannot bulk update more than 500 deals at once"),
    stageId: objectIdSchema,
})
    .strict();
/* ================= GENERIC RUNNER ================= */
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
/* ================= PUBLIC VALIDATORS ================= */
export const validateCreateDeal = (data) => runSchema(createDealSchema, data);
export const validateUpdateDeal = (data) => runSchema(updateDealSchema, data);
export const validateUpdateStage = (data) => runSchema(updateStageSchema, data);
export const validateDealFilters = (data) => runSchema(dealFiltersSchema, data);
export const validateBulkUpdateStage = (data) => runSchema(bulkUpdateStageSchema, data);
//# sourceMappingURL=deal.validation.js.map