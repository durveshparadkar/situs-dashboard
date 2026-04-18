import { LeadContext, BrainSignal } from "./brain.types.js";

/* =====================================================
   SIGNAL DETECTION ENGINE
===================================================== */

export function detectSignals(
  context: LeadContext,
  score: number
): BrainSignal[] {
  const signals: BrainSignal[] = [];

  const dealValue = context.dealValue ?? 0;
  const inactivityDays = context.daysSinceLastActivity;

  const stalledDays = 7;
  const extremeInactivityDays = 21;
  const highValueThreshold = 100000;
  const veryHighValueThreshold = 1000000;

  const hotScoreThreshold = 75;
  const coldScoreThreshold = 30;

  /* =====================================================
     STALLED
  ===================================================== */

  if (inactivityDays >= stalledDays) {
    signals.push({
      type: "STALLED",
      severity:
        inactivityDays >= extremeInactivityDays
          ? "critical"
          : "high",
      message: `Lead inactive for ${inactivityDays} days`,
    });
  }

  /* =====================================================
     HIGH VALUE NO REPLY
  ===================================================== */

  if (
    dealValue >= highValueThreshold &&
    inactivityDays >= 5
  ) {
    signals.push({
      type: "HIGH_VALUE_NO_REPLY",
      severity:
        dealValue >= veryHighValueThreshold
          ? "critical"
          : "high",
      message:
        "High value deal with no recent engagement",
    });
  }

  /* =====================================================
     FAST MOVING
  ===================================================== */

  if (
    context.activityCount >= 5 &&
    context.stageChangedRecently &&
    inactivityDays <= 3
  ) {
    signals.push({
      type: "FAST_MOVING",
      severity: "medium",
      message: "Lead progressing quickly",
    });
  }

  /* =====================================================
     HOT
  ===================================================== */

  if (score >= hotScoreThreshold && inactivityDays <= 3) {
    signals.push({
      type: "HOT",
      severity:
        score >= 90 ? "critical" : "high",
      message: "Highly engaged and active lead",
    });
  }

  /* =====================================================
     COLD
  ===================================================== */

  if (
    score <= coldScoreThreshold &&
    inactivityDays >= stalledDays
  ) {
    signals.push({
      type: "COLD",
      severity:
        inactivityDays >= extremeInactivityDays
          ? "high"
          : "medium",
      message: "Low engagement and inactive lead",
    });
  }

  /* =====================================================
     HIGH RISK (Big deal going cold)
  ===================================================== */

  if (
    dealValue >= veryHighValueThreshold &&
    inactivityDays >= 10
  ) {
    signals.push({
      type: "HIGH_RISK",
      severity: "critical",
      message:
        "Very high value deal at risk due to inactivity",
    });
  }

  return signals;
}