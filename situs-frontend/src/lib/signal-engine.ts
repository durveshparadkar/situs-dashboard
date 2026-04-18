type Deal = {
  name: string;
  value: number;
  stage: string;
  lastActivityDays: number;
};

export function generateSignals(deals: Deal[]) {

  const signals = [];

  const inactiveDeals = deals.filter(
    (deal) => deal.lastActivityDays >= 7
  );

  if (inactiveDeals.length > 0) {

    const revenueAtRisk = inactiveDeals.reduce(
      (sum, d) => sum + d.value,
      0
    );

    signals.push({
      type: "risk",
      priority: "critical",
      title: "Revenue Risk",
      insight: ` $${revenueAtRisk.toLocaleString()} revenue may slip this quarter.`,
      reason: `${inactiveDeals.length} deals inactive for 7+ days`,
      action: "Review stalled deals and schedule follow-ups."
    });

  }

  return signals;

}