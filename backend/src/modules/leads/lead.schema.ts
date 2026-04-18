import { z } from "zod";
import { LeadSource } from "../../shared/enums/lead.enums.js";

/* =====================================================
   CREATE LEAD (Pipeline System)
   NOTE:
   - No stage
   - No probability
   - No pipelineId
   Backend assigns default pipeline + first stage
===================================================== */

export const createLeadSchema = z.object({
  name: z.string(),
  phone: z.string(),
  email: z.string().email().optional(),
  budget: z.number(),
  interestedLocation: z.string(),
  source: z.nativeEnum(LeadSource),
  notes: z.string().optional(),
});

/* =====================================================
   UPDATE LEAD
   - stageId allowed (dynamic pipeline stage)
   - assignedTo allowed
===================================================== */

export const updateLeadSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  budget: z.number().optional(),
  interestedLocation: z.string().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  notes: z.string().optional(),

  // 🔥 Dynamic Stage
  stageId: z.string().optional(),

  // 🔥 Reassignment
  assignedTo: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;