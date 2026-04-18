// src/shared/limits/plan.types.ts

export type Plan = "SMALL_BUSINESS" | "PRO" | "ENTERPRISE";


export interface PlanLimits {
  teams: number;
  users?: number;
  projects?: number;
}