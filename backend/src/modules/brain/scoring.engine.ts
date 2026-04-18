import { LeadContext } from "./brain.types.js";

/* =====================================================
   HELPERS
===================================================== */

function clampScore(score: number): number {
  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}

function logScale(value: number, multiplier: number): number {
  return Math.log10(value + 1) * multiplier;
}

/* =====================================================
   MAIN SCORING ENGINE
===================================================== */

export function calculateScore(context: LeadContext): number {
  const dealValue = context.dealValue ?? 0;
  const stageProbability = context.stageProbability ?? 0;
  const inactivityDays = context.daysSinceLastActivity;
  const activityCount = context.activityCount;

  // Base neutral score
  let score = 40;

  /* ==========================================
     1️⃣ ACTIVITY IMPACT (Diminishing Returns)
  ========================================== */

  if (activityCount > 0) {
    score += logScale(activityCount, 12);
  }

  /* ==========================================
     2️⃣ INACTIVITY PENALTY (Progressive)
  ========================================== */

  if (inactivityDays > 0) {
    const penalty =
      inactivityDays <= 7
        ? inactivityDays * 2
        : 14 + (inactivityDays - 7) * 4;

    score -= penalty;
  }

  /* ==========================================
     3️⃣ DEAL VALUE WEIGHT
  ========================================== */

  if (dealValue > 0) {
    score += logScale(dealValue, 6);
  }

  /* ==========================================
     4️⃣ STAGE PROBABILITY BOOST
  ========================================== */

  if (stageProbability > 0) {
    score += stageProbability * 0.3;
  }

  /* ==========================================
     5️⃣ FAST MOVEMENT BONUS
  ========================================== */

  if (
    context.stageChangedRecently &&
    inactivityDays <= 3
  ) {
    score += 8;
  }

  return clampScore(Math.round(score));
}