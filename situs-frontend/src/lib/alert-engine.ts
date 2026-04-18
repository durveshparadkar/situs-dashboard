/* ================= TYPES ================= */

export type AlertSeverity = "critical" | "watch" | "opportunity";
export type AlertStatus = "new" | "resolved";

export type Lead = {
  _id: string;
  name: string;
  company: string;
  value?: number;
  status: "new" | "contacted" | "qualified" | "converted";
  createdAt: string;
};

export type Deal = {
  _id: string;
  title: string;
  value: number;
  probability: number;
  stage: string;
  updatedAt: string;
};

export type RevenueAlert = {
  id: string;
  title: string;
  message: string;
  company: string;
  severity: AlertSeverity;
  status: AlertStatus;
  impact: number;
  impactLabel: string;
  owner: string;
  detectedAt: string;
  action: string;
  detail: string;

  // 🔥 NEW (navigation support)
  entityType?: "deal" | "lead";
  entityId?: string;
};

/* ================= HELPERS ================= */

function hoursAgo(date: string) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

function formatCurrency(value: number) {
  return `\\$${(value / 1000).toFixed(0)}K`;
}

function formatTime(hours: number) {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ================= ENGINE ================= */

export function generateAlerts(
  leads: Lead[],
  deals: Deal[]
): RevenueAlert[] {
  const alerts: RevenueAlert[] = [];
  const seen = new Set<string>();

  const push = (alert: RevenueAlert) => {
    if (!seen.has(alert.id)) {
      alerts.push(alert);
      seen.add(alert.id);
    }
  };

  /* ================= LEADS ================= */

  leads.forEach((lead) => {
    const age = hoursAgo(lead.createdAt);
    const value = lead.value || 0;

    if (lead.status === "new" && age > 18) {
      push({
        id: `lead-${lead._id}-followup`,
        title: "Follow-up Needed",
        message: `${lead.name} waiting ${Math.floor(age)}h`,
        company: lead.company,
        severity: age > 36 ? "critical" : "watch",
        status: "new",
        impact: value,
        impactLabel: "Lead getting cold",
        owner: "Unassigned",
        detectedAt: formatTime(age),
        action: "Contact now",
        detail: "Delay reduces conversion probability.",

        // 🔥 NEW
        entityType: "lead",
        entityId: lead._id,
      });
    }

    if (lead.status === "qualified") {
      push({
        id: `lead-${lead._id}-qualified`,
        title: "Ready to Convert",
        message: `${lead.name} is highly engaged`,
        company: lead.company,
        severity: "opportunity",
        status: "new",
        impact: value || 15000,
        impactLabel: "High intent",
        owner: "Sales",
        detectedAt: "now",
        action: "Create deal",
        detail: "Strong buying signals detected.",

        // 🔥 NEW
        entityType: "lead",
        entityId: lead._id,
      });
    }

    if (value > 80000 && lead.status !== "converted") {
      push({
        id: `lead-${lead._id}-high`,
        title: "High Value Lead",
        message: `${lead.name} worth ${formatCurrency(value)}`,
        company: lead.company,
        severity: "opportunity",
        status: "new",
        impact: value,
        impactLabel: "Revenue potential",
        owner: "Sales",
        detectedAt: "now",
        action: "Prioritize",
        detail: "Focus here for max ROI.",

        // 🔥 NEW
        entityType: "lead",
        entityId: lead._id,
      });
    }
  });

  /* ================= DEALS ================= */

  deals.forEach((deal) => {
    const inactive = hoursAgo(deal.updatedAt);

    if (deal.value > 50000 && inactive > 48) {
      push({
        id: `deal-${deal._id}-inactive`,
        title: "Deal Going Cold",
        message: `${deal.title} inactive ${Math.floor(inactive)}h`,
        company: deal.title,
        severity: inactive > 96 ? "critical" : "watch",
        status: "new",
        impact: deal.value,
        impactLabel: `${formatCurrency(deal.value)} at risk`,
        owner: "Sales",
        detectedAt: formatTime(inactive),
        action: "Follow up",
        detail: "Momentum lost — re-engage.",

        // 🔥 NEW
        entityType: "deal",
        entityId: deal._id,
      });
    }

    if (deal.value > 100000 && deal.probability < 40) {
      push({
        id: `deal-${deal._id}-risk`,
        title: "High Value Risk",
        message: `${deal.title} unlikely to close`,
        company: deal.title,
        severity: "critical",
        status: "new",
        impact: deal.value,
        impactLabel: "Low confidence",
        owner: "Sales",
        detectedAt: "now",
        action: "Rework strategy",
        detail: "Needs intervention.",

        // 🔥 NEW
        entityType: "deal",
        entityId: deal._id,
      });
    }

    if (inactive > 72) {
      push({
        id: `deal-${deal._id}-stuck`,
        title: "Deal Stuck",
        message: `${deal.title} no progress`,
        company: deal.title,
        severity: "watch",
        status: "new",
        impact: deal.value,
        impactLabel: "Pipeline slowdown",
        owner: "Sales",
        detectedAt: formatTime(inactive),
        action: "Push forward",
        detail: "Investigate blockers.",

        // 🔥 NEW
        entityType: "deal",
        entityId: deal._id,
      });
    }

    if (deal.probability > 80 && deal.value > 20000) {
      push({
        id: `deal-${deal._id}-hot`,
        title: "Closing Opportunity",
        message: `${deal.title} almost won`,
        company: deal.title,
        severity: "opportunity",
        status: "new",
        impact: deal.value,
        impactLabel: `${formatCurrency(deal.value)} expected`,
        owner: "Sales",
        detectedAt: "now",
        action: "Close deal",
        detail: "Push to finish.",

        // 🔥 NEW
        entityType: "deal",
        entityId: deal._id,
      });
    }
  });

  /* ================= PIPELINE ================= */

  const pipeline = deals.reduce((sum, d) => sum + d.value, 0);

  if (pipeline < 500000 && deals.length > 0) {
    push({
      id: "pipeline-low",
      title: "Pipeline Weak",
      message: "Not enough deals in pipeline",
      company: "Pipeline",
      severity: "watch",
      status: "new",
      impact: pipeline,
      impactLabel: `${formatCurrency(pipeline)} total`,
      owner: "Revenue Ops",
      detectedAt: "now",
      action: "Add deals",
      detail: "Future revenue at risk.",

      // 🔥 OPTIONAL (no specific entity)
      entityType: "deal",
    });
  }

  /* ================= SORT ================= */

  const severityRank = {
    critical: 3,
    watch: 2,
    opportunity: 1,
  };

  return alerts
    .sort((a, b) => {
      const s = severityRank[b.severity] - severityRank[a.severity];
      if (s !== 0) return s;
      return b.impact - a.impact;
    })
    .slice(0, 10);
}