import { z } from "zod";

/* =====================================================
   HELPERS
===================================================== */

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email format");

const passwordField = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(100, "Password too long");

/* =====================================================
   REGISTER SCHEMA
===================================================== */

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name too long"),

  email: emailField,

  password: passwordField,

  // 🔥 Optional for enterprise onboarding
  organizationName: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .optional(),
});

/* =====================================================
   LOGIN SCHEMA
===================================================== */

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, "Password is required")
    .max(100),
});

/* =====================================================
   TYPES (AUTO INFER)
===================================================== */

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
