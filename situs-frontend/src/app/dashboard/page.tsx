"use client";

import { useMemo, useState, useEffect, ReactNode } from "react";
import { motion } from "framer-motion";

import MetricCard from "../../components/dashboard/metric-card";
import AISignalCard from "../../components/dashboard/ai-signal-card";
import PipelineHealthChart from "../../components/dashboard/pipeline-health-chart";
import DealsAttentionTable, {
  UIDeal,
} from "../../components/dashboard/deals-attention-table";
import RevenuePulse from "../../components/dashboard/revenue-pulse";
import FocusMode from "../../components/dashboard/focus-mode";
import DealDrawer from "../../components/drawers/deal-drawer";
import RevenueForecast from "../../components/dashboard/revenue-forecast";

import {
  getIntelligenceSummary,
  refreshIntelligence,
  type IntelligenceSummary,
} from "../../lib/intelligence/intelligence.api";

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">{children}</div>
);

const Card = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: "easeOut" }}
    whileHover={{ y: -2 }}
    className={`rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-200 p-5 ${className}`}
  >
    {children}
  </motion.div>
);

/* ================= TYPES ================= */

type Signal = {
  id: string;
  type: "risk" | "opportunity" | "info";
  priority: "critical" | "watch" | "normal";
  title: string;
  insight: string;
  reason: string;
  action: string;
  timestamp: number;
};

const priorityOrder: Record<Signal["priority"], number> = {
  critical: 1,
  watch: 2,
  normal: 3,
};

function createEmptyIntelligenceSummary(): IntelligenceSummary {
  const nowIso = new Date().toISOString();

  return {
    organizationId: "unknown",
    dealRisks: [],
    attentionAlerts: [],
    forecast: {
      summary: {
        totalRevenueAtRisk: 0,
        totalWeightedAtRisk: 0,
        riskyDealsCount: 0,
        totalPipelineValue: 0,
        percentAtRisk: 0,
        confidence: "medium",
        message: "No intelligence signals available yet",
      },
      factors: [],
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byType: {},
      topDealsToWatch: [],
      engineVersion: "fallback",
      computedAt: nowIso,
    },
    pipelineLeaks: {
      leaks: [],
      stageMetrics: [],
      totalPipelineValue: 0,
      totalOpenDeals: 0,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byType: {},
      healthScore: 100,
      summary: "No pipeline intelligence available yet",
      engineVersion: "fallback",
      computedAt: nowIso,
    },
    actions: {
      topActions: [],
      allActions: [],
      totalRevenueImpact: 0,
      criticalRevenueAtRisk: 0,
      opportunityRevenue: 0,
      byType: {
        critical: 0,
        warning: 0,
        opportunity: 0,
        quick_win: 0,
        coaching: 0,
      },
      byPriority: { low: 0, medium: 0, high: 0, critical: 0 },
      coachingSignals: [],
      summary: "No revenue actions available yet",
      engineVersion: "fallback",
      computedAt: nowIso,
    },
    meta: {
      orchestratorVersion: "fallback",
      engineVersions: {},
      dealsProcessed: 0,
      dealsSkipped: 0,
      dealsUpdated: 0,
      alertsEmitted: 0,
      durationMs: 0,
      errors: [],
      computedAt: nowIso,
      dryRun: true,
    },
  };
}

function isAccessDeniedMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("permission denied") ||
    normalized.includes("access denied") ||
    normalized.includes("forbidden")
  );
}

/* ================= INR FORMATTER ================= */

function formatINR(rupees: number): string {
  if (rupees >= 10_000_000) {
    return "₹" + (rupees / 10_000_000).toFixed(1) + "Cr";
  }
  if (rupees >= 100_000) {
    return "₹" + (rupees / 100_000).toFixed(1) + "L";
  }
  return "₹" + rupees.toLocaleString("en-IN");
}

/* ================= SIGNAL MAPPERS ================= */

function mapBackendPriorityToSignal(
  priority: "low" | "medium" | "high" | "critical"
): Signal["priority"] {
  if (priority === "critical") return "critical";
  if (priority === "high")     return "critical";
  if (priority === "medium")   return "watch";
  return "normal";
}

function buildSignalsFromIntelligence(intel: IntelligenceSummary): Omit<Signal, "timestamp">[] {
  const list: Omit<Signal, "timestamp">[] = [];

  intel.attentionAlerts.forEach((a, i) => {
    list.push({
      id: "alert-" + (a.dealId ?? i),
      type: "risk",
      priority: mapBackendPriorityToSignal(a.priority),
      title: "Deal Requires Attention",
      insight: a.message,
      reason: a.dealName,
      action: a.recommendedAction,
    });
  });

  intel.pipelineLeaks.leaks.forEach((l, i) => {
    list.push({
      id: "leak-" + i,
      type: "risk",
      priority: mapBackendPriorityToSignal(l.severity),
      title: "Pipeline Leak",
      insight: l.message,
      reason: l.stage ?? "Portfolio",
      action: l.recommendedAction,
    });
  });

  intel.actions.topActions.forEach((a) => {
    const isOpp = a.type === "opportunity" || a.type === "quick_win";
    list.push({
      id: a.actionId,
      type: isOpp ? "opportunity" : a.type === "warning" ? "risk" : "info",
      priority: mapBackendPriorityToSignal(a.priority),
      title: a.title,
      insight: a.action,
      reason: a.reason,
      action: a.action,
    });
  });

  if (intel.forecast.summary.totalRevenueAtRisk > 0) {
    list.push({
      id: "forecast",
      type: "risk",
      priority: intel.forecast.summary.confidence === "low" ? "critical" : "watch",
      title: "Forecast Risk",
      insight: intel.forecast.summary.message,
      reason: "Pipeline issue",
      action: "Review deals",
    });
  }

  return list.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}

/* ================= UI DEAL MAPPER ================= */

function mapToUIDeals(intel: IntelligenceSummary): UIDeal[] {
  return intel.dealRisks
    .filter((d) => d.dealId !== undefined)
    .map((d) => ({
      id:        String(d.dealId),
      name:      d.name,
      riskScore: d.riskScore,
      reasons:   d.reasons,
    }));
}

/* ================= METRIC AGGREGATORS ================= */

function getMetrics(intel: IntelligenceSummary): {
  pipeline:     string;
  revenue:      string;
  atRisk:       string;
  escalations:  string;
} {
  const pipeline    = intel.pipelineLeaks.totalPipelineValue;
  const atRisk      = intel.forecast.summary.totalRevenueAtRisk;
  const weighted    = intel.forecast.summary.totalWeightedAtRisk;
  const escalations = intel.actions.byType.critical ?? 0;

  return {
    pipeline:    formatINR(pipeline),
    revenue:     formatINR(weighted),
    atRisk:      formatINR(atRisk),
    escalations: String(escalations),
  };
}

/* ================= PAGE ================= */

export default function DashboardPage() {
  const [now, setNow] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<UIDeal | null>(null);
  const [intel, setIntel] = useState<IntelligenceSummary | null>(null);

  useEffect(() => {
    setMounted(true);

    const interval = setInterval(() => setNow(Date.now()), 1000);

    async function fetchIntelligence() {
      try {
        try {
          await refreshIntelligence();
        } catch (refreshErr) {
          console.error("Intelligence refresh failed (non-blocking)", refreshErr);
        }

        const data = await getIntelligenceSummary();
        setIntel(data);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load intelligence";

        if (isAccessDeniedMessage(message)) {
          setIntel(createEmptyIntelligenceSummary());
          setError(null);
          return;
        }

        setError(message);
        setIntel(createEmptyIntelligenceSummary());
      } finally {
        setLoading(false);
      }
    }

    fetchIntelligence();
    return () => clearInterval(interval);
  }, []);

  /* ================= COMPUTED ================= */

  const uiDeals: UIDeal[] = useMemo(
    () => (intel ? mapToUIDeals(intel) : []),
    [intel]
  );

  const baseSignals = useMemo(
    () => (intel ? buildSignalsFromIntelligence(intel) : []),
    [intel]
  );

  const signals = useMemo(
    () => baseSignals.map((s) => ({ ...s, timestamp: now })),
    [baseSignals, now]
  );

  const metrics = useMemo(
    () =>
      intel
        ? getMetrics(intel)
        : { pipeline: "₹0", revenue: "₹0", atRisk: "₹0", escalations: "0" },
    [intel]
  );

  const getSignalAge = (t: number) => {
    const s = Math.floor((now - t) / 1000);
    if (s < 60) return s + "s ago";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    return Math.floor(m / 60) + "h ago";
  };

  const pulseStatus =
    signals.some((s) => s.priority === "critical")
      ? "critical"
      : signals.some((s) => s.priority === "watch")
      ? "watch"
      : "healthy";

  const pulseMessage =
    pulseStatus === "critical"
      ? "Immediate attention required"
      : pulseStatus === "watch"
      ? "Early warning signals detected"
      : "Pipeline healthy — no action needed right now";

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-48 bg-slate-200 rounded-md" />
          <div className="h-4 w-72 bg-slate-100 rounded-md" />
        </div>
        <div className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-slate-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  /* ================= ERROR ================= */

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Card className="border-red-200 bg-red-50/60">
          <h2 className="text-lg font-semibold text-red-700">
            Unable to load intelligence
          </h2>
          <p className="text-sm text-red-600 mt-1.5">{error}</p>
          <p className="text-xs text-red-500/80 mt-3">
            Check that the backend is running and you&apos;re signed in.
          </p>
        </Card>
      </div>
    );
  }

  /* ================= UI ================= */

  const headlineLeak = intel?.pipelineLeaks.leaks[0] ?? null;

  return (
    <>
      <PageContainer>

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              AI-powered revenue overview
            </p>
          </div>

          <div className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            {mounted ? new Date(now).toLocaleTimeString() : "--:--"}
          </div>
        </div>

        {/* PULSE */}
        <Card>
          <RevenuePulse status={pulseStatus} message={pulseMessage} />
        </Card>

        {/* METRICS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card><MetricCard title="Pipeline" value={metrics.pipeline} /></Card>
          <Card><MetricCard title="Revenue" value={metrics.revenue} /></Card>
          <Card><MetricCard title="At Risk" value={metrics.atRisk} /></Card>
          <Card><MetricCard title="Escalations" value={metrics.escalations} /></Card>
        </div>

        {/* FOCUS */}
        <Card>
          <FocusMode deals={uiDeals.slice(0, 3)} onDealClickAction={setSelectedDeal} />
        </Card>

        {/* SIGNALS */}
        {signals.length > 0 && (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {signals.slice(0, 6).map((s) => (
              <AISignalCard
                key={s.id}
                {...s}
                timestamp={getSignalAge(s.timestamp)}
              />
            ))}
          </div>
        )}

        {/* CHART + FORECAST */}
        <div className="grid lg:grid-cols-2 gap-5">
          <Card><PipelineHealthChart /></Card>
          <Card>
            <RevenueForecast
              expectedRevenue={
                intel ? intel.forecast.summary.totalWeightedAtRisk : 0
              }
              confidence={
                intel
                  ? intel.forecast.summary.confidence === "high"
                    ? 85
                    : intel.forecast.summary.confidence === "medium"
                    ? 65
                    : 35
                  : 0
              }
              dealsLikely={
                intel ? intel.dealRisks.filter((d) => d.riskScore < 50).length : 0
              }
              prevActual={1310000}
            />
          </Card>
        </div>

        {/* TABLE */}
        <Card>
          <DealsAttentionTable deals={uiDeals} onDealClickAction={setSelectedDeal} />
        </Card>

        {/* PIPELINE LEAK ALERT */}
        {headlineLeak && (
          <Card className="border-amber-200 bg-amber-50/50">
            <p className="text-sm text-amber-700">
              {headlineLeak.message}
            </p>
          </Card>
        )}

      </PageContainer>

      <DealDrawer
        deal={
          selectedDeal
            ? {
                _id: selectedDeal.id,
                name: selectedDeal.name,
                value: 0,
                riskScore: selectedDeal.riskScore,
              }
            : null
        }
        onClose={() => setSelectedDeal(null)}
        onUpdate={() => setSelectedDeal(null)}
      />
    </>
  );
}
