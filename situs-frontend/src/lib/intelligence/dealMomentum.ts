export type MomentumDeal = {
  lastActivityDays?: number;
  stageDays?: number;
  probability?: number;
};

export type DealMomentum = "improving" | "stable" | "slowing" | "stalled";

export function calculateMomentum(deal: MomentumDeal): DealMomentum {
  const lastActivityDays = deal.lastActivityDays ?? 0;
  const stageDays = deal.stageDays ?? 0;

  if (lastActivityDays <= 2 && (deal.probability ?? 0) >= 60) {
    return "improving";
  }

  if (lastActivityDays >= 15 || stageDays >= 21) {
    return "stalled";
  }

  if (lastActivityDays >= 7 || stageDays >= 14) {
    return "slowing";
  }

  return "stable";
}
