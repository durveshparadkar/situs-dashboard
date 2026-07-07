import { formatCurrency as formatCurrencyShared, OrgCurrency } from "@/lib/currency";

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

  entityType?: "deal" | "lead";
  entityId?: string;

  // 🔥 NEW CORE
  riskScore: number;
};

/* ================= HELPERS ================= */

function hoursAgo(date: string) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

/* Uses the shared app-wide formatter (Lakh/Crore for INR, K/M for
   others) instead of a local always-"K" formatter, so alert messages
   read consistently with every other money value in the app. */
function formatCurrency(value: number, currency: OrgCurrency): string {
  return formatCurrencyShared(value, currency);
}

function formatTime(hours: number) {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ================= AI SCORING ================= */

function computeRiskScore({
  severity,
  impact,
  hours,
  probability,
}: {
  severity: AlertSeverity;
  impact: number;
  hours?: number;
  probability?: number;
}) {
  let score = 0;

  // severity weight
  if (severity === "critical") score += 70;
  if (severity === "watch") score += 40;
  if (severity === "opportunity") score += 30;

  // revenue weight
  score += Math.min(impact / 1000, 30);

  // time decay / urgency
  if (hours) score += Math.min(hours, 30);

  // deal probability signal
  if (probability !== undefined) {
    if (probability < 40) score += 20; // risk
    if (probability > 80) score += 15; // opportunity boost
  }

  return Math.round(score);
}

/* ================= ENGINE ================= */

export function generateAlerts(
  leads: Lead[],
  deals: Deal[],
  currency: OrgCurrency = "INR"
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

    // 🔥 cold lead
    if (lead.status === "new" && age > 18) {
      const severity = age > 36 ? "critical" : "watch";

      push({
        id: `lead-${lead._id}-cold`,
        title: "Lead Going Cold",
        message: `${lead.name} inactive ${Math.floor(age)}h`,
        company: lead.company,
        severity,
        status: "new",
        impact: value,
        impactLabel: "Conversion risk",
        owner: "Sales",
        detectedAt: formatTime(age),
        action: "Contact immediately",
        detail: "Delay reduces conversion probability.",
        entityType: "lead",
        entityId: lead._id,
        riskScore: computeRiskScore({ severity, impact: value, hours: age }),
      });
    }

    // 🔥 high intent lead
    if (lead.status === "qualified") {
      push({
        id: `lead-${lead._id}-qualified`,
        title: "High Intent Lead",
        message: `${lead.name} ready to convert`,
        company: lead.company,
        severity: "opportunity",
        status: "new",
        impact: value || 15000,
        impactLabel: "High intent",
        owner: "Sales",
        detectedAt: "now",
        action: "Create deal",
        detail: "Strong buying signals detected.",
        entityType: "lead",
        entityId: lead._id,
        riskScore: computeRiskScore({
          severity: "opportunity",
          impact: value || 15000,
        }),
      });
    }

    // 🔥 high value lead
    if (value > 80000 && lead.status !== "converted") {
      push({
        id: `lead-${lead._id}-high`,
        title: "High Value Lead",
        message: `${lead.name} worth ${formatCurrency(value, currency)}`,
        company: lead.company,
        severity: "opportunity",
        status: "new",
        impact: value,
        impactLabel: "Revenue potential",
        owner: "Sales",
        detectedAt: "now",
        action: "Prioritize",
        detail: "Focus here for max ROI.",
        entityType: "lead",
        entityId: lead._id,
        riskScore: computeRiskScore({
          severity: "opportunity",
          impact: value,
        }),
      });
    }
  });

  /* ================= DEALS ================= */

  deals.forEach((deal) => {
    const inactive = hoursAgo(deal.updatedAt);

    // 🔥 deal going cold
    if (deal.value > 50000 && inactive > 48) {
      const severity = inactive > 96 ? "critical" : "watch";

      push({
        id: `deal-${deal._id}-cold`,
        title: "Deal Going Cold",
        message: `${deal.title} inactive ${Math.floor(inactive)}h`,
        company: deal.title,
        severity,
        status: "new",
        impact: deal.value,
        impactLabel: `${formatCurrency(deal.value, currency)} at risk`,
        owner: "Sales",
        detectedAt: formatTime(inactive),
        action: "Re-engage",
        detail: "Momentum lost — act now.",
        entityType: "deal",
        entityId: deal._id,
        riskScore: computeRiskScore({
          severity,
          impact: deal.value,
          hours: inactive,
        }),
      });
    }

    // 🔥 high value risk
    if (deal.value > 100000 && deal.probability < 40) {
      push({
        id: `deal-${deal._id}-risk`,
        title: "High Value at Risk",
        message: `${deal.title} may not close`,
        company: deal.title,
        severity: "critical",
        status: "new",
        impact: deal.value,
        impactLabel: "Low probability",
        owner: "Sales",
        detectedAt: "now",
        action: "Fix strategy",
        detail: "Urgent intervention needed.",
        entityType: "deal",
        entityId: deal._id,
        riskScore: computeRiskScore({
          severity: "critical",
          impact: deal.value,
          probability: deal.probability,
        }),
      });
    }

    // 🔥 stuck deal
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
        action: "Investigate",
        detail: "Likely internal blocker.",
        entityType: "deal",
        entityId: deal._id,
        riskScore: computeRiskScore({
          severity: "watch",
          impact: deal.value,
          hours: inactive,
        }),
      });
    }

    // 🔥 closing opportunity
    if (deal.probability > 80 && deal.value > 20000) {
      push({
        id: `deal-${deal._id}-hot`,
        title: "Closing Soon",
        message: `${deal.title} near conversion`,
        company: deal.title,
        severity: "opportunity",
        status: "new",
        impact: deal.value,
        impactLabel: `${formatCurrency(deal.value, currency)} expected`,
        owner: "Sales",
        detectedAt: "now",
        action: "Close deal",
        detail: "Push to finish line.",
        entityType: "deal",
        entityId: deal._id,
        riskScore: computeRiskScore({
          severity: "opportunity",
          impact: deal.value,
          probability: deal.probability,
        }),
      });
    }
  });

  /* ================= PIPELINE ================= */

  const pipeline = deals.reduce((sum, d) => sum + d.value, 0);

  if (pipeline < 500000 && deals.length > 0) {
    push({
      id: "pipeline-low",
      title: "Weak Pipeline",
      message: "Pipeline coverage is low",
      company: "Pipeline",
      severity: "watch",
      status: "new",
      impact: pipeline,
      impactLabel: `${formatCurrency(pipeline, currency)} total`,
      owner: "Revenue Ops",
      detectedAt: "now",
      action: "Generate pipeline",
      detail: "Future revenue risk.",
      riskScore: computeRiskScore({
        severity: "watch",
        impact: pipeline,
      }),
    });
  }

  /* ================= FINAL SORT ================= */

  return alerts
    .sort((a, b) => b.riskScore - a.riskScore) // 🔥 AI priority
    .slice(0, 15);
}