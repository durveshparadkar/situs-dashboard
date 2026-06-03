import { z } from "zod";
import { LeadSource } from "../../shared/enums/lead.enums.js";
/* =====================================================
   🔥 COMMON HELPERS
===================================================== */
// Normalize optional string → null instead of undefined
const optionalString = z
    .string()
    .trim()
    .min(1)
    .transform((val) => val || null)
    .optional()
    .nullable();
// Phone basic validation (can upgrade later)
const phoneSchema = z
    .string()
    .trim()
    .min(6, "Phone too short")
    .max(20, "Phone too long");
// Budget validation
const budgetSchema = z
    .number()
    .min(0, "Budget must be positive");
/* =====================================================
   🧾 CREATE LEAD (ENTERPRISE SAFE)
===================================================== */
export const createLeadSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(100),
    phone: phoneSchema,
    email: z
        .string()
        .email("Invalid email")
        .trim()
        .toLowerCase()
        .optional()
        .nullable()
        .transform((val) => val ?? null),
    budget: budgetSchema,
    interestedLocation: z
        .string()
        .trim()
        .min(1, "Location required"),
    source: z.nativeEnum(LeadSource),
    notes: optionalString,
});
/* =====================================================
   ✏️ UPDATE LEAD (STRICT PARTIAL)
===================================================== */
export const updateLeadSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: phoneSchema.optional(),
    email: z
        .string()
        .email()
        .trim()
        .toLowerCase()
        .optional()
        .nullable()
        .transform((val) => val ?? null),
    budget: budgetSchema.optional(),
    interestedLocation: z.string().trim().optional(),
    source: z.nativeEnum(LeadSource).optional(),
    notes: optionalString,
    /* ================= PIPELINE ================= */
    stageId: z.string().min(1).optional(),
    assignedTo: z.string().min(1).optional(),
});
//# sourceMappingURL=lead.schema.js.map