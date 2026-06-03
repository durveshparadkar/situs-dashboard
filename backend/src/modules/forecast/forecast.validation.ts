// forecast.validation.ts
import { z } from "zod";
import mongoose from "mongoose";

/* =====================================================
   ERROR
===================================================== */

export class ValidationError extends Error {
  public statusCode = 400;
  public code = "VALIDATION_ERROR";
  public details: Array<{ field: string; message: string }>;

  constructor(details: Array<{ field: string; message: string }>) {
    super("Validation failed");
    this.name = "ValidationError";
    this.details = details;
  }
}

/* =====================================================
   ENUMS — single source of truth
===================================================== */

export const FORECAST_RANGES = [
  "week",
  "month",
  "quarter",
  "year",
  "custom",
] as const;

export type ForecastRange = (typeof FORECAST_RANGES)[number];

export const FORECAST_MODELS = [
  "weighted_pipeline",
  "best_case",
  "commit",
  "ai_blended",
] as const;

export type ForecastModel = (typeof FORECAST_MODELS)[number];

export const FORECAST_GROUP_BY = ["stage", "owner", "month", "week"] as const;

export type ForecastGroupBy = (typeof FORECAST_GROUP_BY)[number];

/* =====================================================
   LEGACY RANGE MAPPING (backward compatibility)
   Old clients send "7d" / "30d" / "90d" — translate transparently.
===================================================== */

const LEGACY_RANGE_MAP: Record<string, ForecastRange> = {
  "7d":  "week",
  "30d": "month",
  "90d": "quarter",
  "1y":  "year",
};

/* =====================================================
   REUSABLE PRIMITIVES
===================================================== */

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
  });

const isoDateSchema = z
  .union([z.string().datetime(), z.string().date(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !isNaN(d.getTime()), { message: "Invalid date" });

/**
 * Range schema — accepts both the new vocabulary and legacy "Xd" tokens.
 * Transforms legacy values to the canonical form so the service layer
 * only ever sees week | month | quarter | year | custom.
 */
const rangeSchema = z
  .string()
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const lower = v.toLowerCase().trim();
    return LEGACY_RANGE_MAP[lower] ?? lower;
  })
  .pipe(
    z
      .enum(FORECAST_RANGES)
      .optional()
      .or(z.undefined())
  );

/* =====================================================
   FORECAST QUERY SCHEMA
===================================================== */

export const forecastQuerySchema = z
  .object({
    range: rangeSchema,

    /* For range = "custom" — both required together */
    startDate: isoDateSchema.optional(),
    endDate:   isoDateSchema.optional(),

    /* Optional filters */
    pipelineId: objectIdSchema.optional(),
    ownerId:    objectIdSchema.optional(),

    /* Forecast model */
    model: z.enum(FORECAST_MODELS).optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Custom range requires both startDate and endDate
      if (data.range === "custom") {
        return !!(data.startDate && data.endDate);
      }
      return true;
    },
    {
      message: "startDate and endDate are required when range is 'custom'",
      path: ["range"],
    }
  )
  .refine(
    (data) => {
      // If both dates provided, start must be before end
      if (data.startDate && data.endDate) {
        return data.startDate.getTime() < data.endDate.getTime();
      }
      return true;
    },
    {
      message: "startDate must be before endDate",
      path: ["startDate"],
    }
  )
  .refine(
    (data) => {
      // Reject windows longer than 5 years (prevents accidental DB hammering)
      if (data.startDate && data.endDate) {
        const maxMs = 5 * 365 * 24 * 60 * 60 * 1000;
        return data.endDate.getTime() - data.startDate.getTime() <= maxMs;
      }
      return true;
    },
    {
      message: "Date range cannot exceed 5 years",
      path: ["endDate"],
    }
  );

export type ForecastQueryInput = z.infer<typeof forecastQuerySchema>;

/* =====================================================
   BREAKDOWN QUERY SCHEMA
===================================================== */

export const forecastBreakdownQuerySchema = z
  .object({
    groupBy: z.enum(FORECAST_GROUP_BY).optional().default("stage"),
    range:   rangeSchema,
    pipelineId: objectIdSchema.optional(),
    ownerId:    objectIdSchema.optional(),
  })
  .strict();

export type ForecastBreakdownQueryInput = z.infer<typeof forecastBreakdownQuerySchema>;

/* =====================================================
   GENERIC RUNNER
===================================================== */

function runSchema<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details = result.error.issues.map((e) => ({
      field:   e.path.length ? e.path.join(".") : "(root)",
      message: e.message,
    }));
    throw new ValidationError(details);
  }

  return result.data;
}

/* =====================================================
   PUBLIC VALIDATORS
===================================================== */

/**
 * Validate forecast query params.
 * Returns the parsed/normalized data — legacy "30d" becomes "month", etc.
 *
 * Backwards-compatible: existing call sites that ignore the return value
 * (treating this as a side-effect throwing function) still work.
 */
export const validateForecastQuery = (query: unknown): ForecastQueryInput => {
  return runSchema(forecastQuerySchema, query);
};

/**
 * Validate forecast breakdown query params.
 */
export const validateForecastBreakdownQuery = (
  query: unknown
): ForecastBreakdownQueryInput => {
  return runSchema(forecastBreakdownQuerySchema, query);
};