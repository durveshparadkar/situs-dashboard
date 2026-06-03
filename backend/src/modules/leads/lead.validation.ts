import { z } from "zod";
import { LeadSource } from "../../shared/enums/lead.enums.js";

/* =====================================================
   🔥 COMMON HELPERS
===================================================== */

// Normalize string (trim + empty → undefined)
const cleanString = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

// Optional string → null safe
const optionalString = z.preprocess(
  cleanString,
  z.string().optional().nullable()
);

// Required clean string
const requiredString = z.preprocess(
  cleanString,
  z.string().min(1, "Field is required")
);

// Phone validation (India + global safe)
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Invalid phone number"); // 🇮🇳 adjust if global

/* =====================================================
   🧾 CREATE LEAD
===================================================== */

export const createLeadSchema = z.object({
  name: requiredString,

  phone: phoneSchema,

  email: optionalString
    .refine(
      (val) => !val || z.string().email().safeParse(val).success,
      "Invalid email"
    )
    .transform((val) => val ?? null),

  budget: z.number().min(0, "Budget must be >= 0"),

  interestedLocation: requiredString,

  source: z.nativeEnum(LeadSource),

  notes: optionalString.transform((val) => val ?? undefined),
});

/* =====================================================
   ✏️ UPDATE LEAD
===================================================== */

export const updateLeadSchema = z.object({
  name: requiredString.optional(),

  phone: phoneSchema.optional(),

  email: optionalString
    .refine(
      (val) => !val || z.string().email().safeParse(val).success,
      "Invalid email"
    )
    .transform((val) => val ?? null)
    .optional(),

  budget: z.number().min(0).optional(),

  interestedLocation: requiredString.optional(),

  source: z.nativeEnum(LeadSource).optional(),

  notes: optionalString.optional(),

  /* 🔥 PIPELINE CONTROL */

  stageId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid stageId")
    .optional(),

  assignedTo: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid userId")
    .optional(),
});

/* =====================================================
   🔎 QUERY VALIDATION (VERY IMPORTANT)
===================================================== */

export const leadQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 1))
    .refine((val) => val > 0, "Page must be > 0"),

  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 10))
    .refine((val) => val > 0 && val <= 100, "Limit must be 1–100"),

  search: optionalString,

  priority: z
    .enum(["low", "medium", "high", "critical"])
    .optional(),

  isStale: z
    .string()
    .optional()
    .transform((val) =>
      val === "true" ? true : val === "false" ? false : undefined
    ),

  assignedTo: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

/* =====================================================
   TYPES
===================================================== */

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type LeadQueryInput = z.infer<typeof leadQuerySchema>;