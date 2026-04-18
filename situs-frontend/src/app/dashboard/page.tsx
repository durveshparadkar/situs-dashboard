"use client";

import { useMemo, useState, useEffect } from "react";

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

import { detectForecastRisk } from "../../lib/forecast-risk-engine";
import { generateRevenueDecisions } from "../../lib/revenue-decision-engine";
import { pipelineIntelligenceEngine } from "../../lib/pipeline-intelligence-engine";
import { rankDealsByRisk } from "../../lib/deal-risk-engine";
import { detectPipelineLeaks } from "../../lib/pipeline-leak-engine";
import { detectDealAttention } from "../../lib/deals-attention-engine";

/* ================= UI ================= */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 p-5 h-full flex flex-col">
      {children}
    </div>
  );
}

/* ================= TYPES ================= */

type Deal = {
  id: string;
  name: string;
  value: number;
  stage: string;
  lastActivityDays: number;
  daysInStage: number;
  closeDateDays: number;
};

type RiskDeal = {
  id?: string;
  name: string;
  riskScore?: number;
  reasons?: string[];
};

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

/* ================= PAGE ================= */

export default function DashboardPage() {
  const [now, setNow] = useState<number>(() => Date.now());
  const [mounted, setMounted] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<UIDeal | null>(null);

  useEffect(() => {
  setTimeout(() => {
    setMounted(true);
  }, 0);

  const interval = setInterval(() => {
    setNow(Date.now());
  }, 1000);

  return () => clearInterval(interval);
}, []);

  /* ================= DATA ================= */

  const deals: Deal[] = useMemo(
    () => [
      {
        id: "1",
        name: "Acme Enterprise",
        value: 200000,
        stage: "Negotiation",
        lastActivityDays: 9,
        daysInStage: 16,
        closeDateDays: 6,
      },
      {
        id: "2",
        name: "Nova Systems",
        value: 120000,
        stage: "Proposal",
        lastActivityDays: 2,
        daysInStage: 4,
        closeDateDays: 25,
      },
      {
        id: "3",
        name: "Titan Corp",
        value: 160000,
        stage: "Negotiation",
        lastActivityDays: 11,
        daysInStage: 12,
        closeDateDays: 8,
      },
    ],
    []
  );

  const pipelineIntel = useMemo(
    () => pipelineIntelligenceEngine(deals),
    [deals]
  );

  const riskRankedDeals = useMemo(() => rankDealsByRisk(deals), [deals]);

  const uiDeals: UIDeal[] = useMemo(
    () =>
      (riskRankedDeals as RiskDeal[]).map((d, i) => ({
        id: d.id ?? i.toString(),
        name: d.name,
        riskScore: d.riskScore ?? 0,
        reasons: d.reasons ?? [],
      })),
    [riskRankedDeals]
  );

  /* ================= SIGNALS ================= */

  const baseSignals = useMemo(() => {
    const alerts = detectDealAttention(deals);
    const leaks = detectPipelineLeaks(deals);
    const forecastRisk = detectForecastRisk(deals);
    const decisions = generateRevenueDecisions(deals, leaks, forecastRisk);

    const list: Omit<Signal, "timestamp">[] = [];

    alerts.forEach((a, i) =>
      list.push({
        id: "alert-" + i,
        type: "risk",
        priority: "critical",
        title: "Deal Requires Attention",
        insight: a.message,
        reason: a.dealName,
        action: "Review immediately",
      })
    );

    leaks.forEach((l, i) =>
      list.push({
        id: "leak-" + i,
        type: "risk",
        priority: "watch",
        title: "Pipeline Leak",
        insight: l.message,
        reason: l.stage,
        action: "Investigate stage",
      })
    );

    decisions.forEach((d) =>
      list.push({ ...d, type: "info" as const })
    );

    if (forecastRisk) {
      list.push({
        id: "forecast",
        type: "risk",
        priority: "critical",
        title: "Forecast Risk",
        insight: forecastRisk.message,
        reason: "Pipeline issue",
        action: "Review deals",
      });
    }

    return list.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }, [deals]);

  const signals: Signal[] = useMemo(
    () => baseSignals.map((s) => ({ ...s, timestamp: now })),
    [baseSignals, now]
  );

  function getSignalAge(t: number) {
    const s = Math.floor((now - t) / 1000);
    if (s < 60) return s + "s ago";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    return Math.floor(m / 60) + "h ago";
  }

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
      : "Pipeline healthy";

  /* ================= UI ================= */

  return (
    <>
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-12">

        {/* HEADER */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              Revenue Command Center
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Live intelligence across your pipeline
            </p>
          </div>

          <div className="text-xs font-mono bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-md text-slate-600">
            {mounted ? new Date(now).toLocaleTimeString() : "--:--:--"}
          </div>
        </div>

        {/* PULSE */}
        <Card>
          <RevenuePulse status={pulseStatus} message={pulseMessage} />
        </Card>

        {/* METRICS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card><MetricCard title="Pipeline" value="₹3.2Cr" /></Card>
          <Card><MetricCard title="Revenue" value="₹1.4Cr" /></Card>
          <Card><MetricCard title="At Risk" value="₹48L" /></Card>
          <Card><MetricCard title="Escalations" value="6" /></Card>
        </div>

        {/* FOCUS */}
        <Card>
          <FocusMode
            deals={uiDeals.slice(0, 3)}
            onDealClickAction={setSelectedDeal}
          />
        </Card>

        {/* AI SIGNALS */}
        <div className="grid md:grid-cols-3 gap-6">
          {signals.slice(0, 6).map((s) => (
            <Card key={s.id}>
              <div className="flex flex-col justify-between h-full">
                <AISignalCard {...s} />
                <div className="text-xs text-slate-500 mt-3">
                  {getSignalAge(s.timestamp)}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* CHART + FORECAST */}
        <div className="grid xl:grid-cols-2 gap-6 items-stretch">

          <Card>
  <div className="w-full h-[380px]">
    <PipelineHealthChart />
  </div>
</Card>

          <Card>
  <div className="h-[380px] w-full">
    <RevenueForecast
      expectedRevenue={1420000}
      confidence={78}
      dealsLikely={14}
      prevActual={1310000}
    />
  </div>
</Card>

        </div>

        {/* TABLE */}
        <Card>
          <DealsAttentionTable
            deals={uiDeals}
            onDealClickAction={setSelectedDeal}
          />
        </Card>

        {/* ALERT */}
        {pipelineIntel?.pipelineLeakSignal && (
          <Card>
            <p className="text-sm text-amber-600">
              {pipelineIntel.pipelineLeakSignal.message}
            </p>
          </Card>
        )}
      </div>

      {/* DRAWER */}
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