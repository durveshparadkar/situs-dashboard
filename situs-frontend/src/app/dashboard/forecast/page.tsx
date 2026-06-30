"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import RevenueChart from "../../../components/forecast/revenue-chart";
import RiskInsight from "../../../components/forecast/risk-insight";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { apiFetch } from "@/lib/api";

/* ================= TYPES (match backend forecast.service.ts) ================= */

type ForecastSummary = {
  totalPipelineValue: number;
  weightedForecast: number;
  commitForecast: number;
  bestCaseForecast: number;
  closedWonValue: number;
  closedLostValue: number;
  averageDealSize: number;
};

type ForecastMetrics = {
  totalDeals: number;
  openDeals: number;
  closedWon: number;
  closedLost: number;
  commitDeals: number;
  bestCaseDeals: number;
  conversionRate: number;
  winRate: number;
  pipelineHealth: number;
  averageProbability: number;
  overdueDeals: number;
  stalledDeals: number;
};

type ForecastInsight = {
  level: "info" | "warning" | "critical" | "positive";
  category: string;
  message: string;
  reasoning?: string[];
  metric?: number;
};

type ForecastResult = {
  summary: ForecastSummary;
  metrics: ForecastMetrics;
  insights: ForecastInsight[];
};

/* Breakdown item (for the chart) */
type BreakdownItem = {
  key: string;
  label: string;
  totalValue: number;
  weightedValue: number;
  commitValue: number;
  bestCaseValue: number;
  dealCount: number;
};

/* Deal shape used for risk insight (matches Deal schema's riskLevel) */
type DealLite = {
  value: number;
  riskLevel: "low" | "medium" | "high" | "critical";
};

const mapRisk = (level: DealLite["riskLevel"]): "Low" | "Medium" | "High" => {
  if (level === "low") return "Low";
  if (level === "medium") return "Medium";
  return "High"; // collapses "high" and "critical" into High
};

/* ================= HELPERS ================= */

const formatMoney = (v: number) => `₹${(v ?? 0).toLocaleString("en-IN")}`;

const insightColor = (level: ForecastInsight["level"]) => {
  if (level === "critical") return "text-red-600";
  if (level === "warning") return "text-amber-600";
  if (level === "positive") return "text-emerald-600";
  return "text-slate-600";
};

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">{children}</div>
);

const PageHeader = ({ onBack }: { onBack: () => void }) => (
  <div className="flex justify-between items-center">
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
    >
      <ArrowLeft size={16} />
      Back
    </button>
  </div>
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

/* ================= PAGE ================= */

export default function ForecastPage() {
  const router = useRouter();

  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [deals, setDeals] = useState<DealLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ForecastInsight | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        /* Main forecast — real backend engine (weighted pipeline, commit
           buckets, win rate, hygiene signals, structured insights). */
        const res = await apiFetch<{ success: boolean; data: ForecastResult }>(
          "/api/forecast?range=month"
        );

        if (res?.success && res?.data) {
          setForecast(res.data);
        }
      } catch (err) {
        console.error("Failed to load forecast", err);
      }

      try {
        /* Breakdown by stage — drives the chart. */
        const res = await apiFetch<{ success: boolean; data: BreakdownItem[] }>(
          "/api/forecast/breakdown?groupBy=stage"
        );
        if (res?.success && Array.isArray(res.data)) {
          setBreakdown(res.data);
        }
      } catch (err) {
        console.error("Failed to load breakdown", err);
      }

      try {
        /* Open deals — drives the Low/Medium/High risk cards.
           ⚠️ UNVERIFIED ENDPOINT — confirm this matches your real deals route. */
        const res = await apiFetch<{ success: boolean; data: DealLite[] }>(
          "/api/deals?status=open"
        );
        if (res?.success && Array.isArray(res.data)) {
          setDeals(res.data);
        }
      } catch (err) {
        console.error("Failed to load deals for risk insight", err);
      }

      setLoading(false);
    };

    load();
  }, []);

  const summary = forecast?.summary;
  const metrics = forecast?.metrics;
  const insights = useMemo(() => forecast?.insights ?? [], [forecast]);

  /* Chart: weighted value per stage (top 5 by weighted value) */
  const chartData = useMemo(
    () =>
      [...breakdown]
        .sort((a, b) => b.weightedValue - a.weightedValue)
        .slice(0, 5)
        .map((b) => ({ name: b.label || b.key, value: b.weightedValue })),
    [breakdown]
  );

  /* Risk cards: map Deal schema's riskLevel into RiskInsight's expected shape */
  const riskDeals = useMemo(
    () => deals.map((d) => ({ risk: mapRisk(d.riskLevel), value: d.value })),
    [deals]
  );

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="h-4 w-16 bg-slate-200 rounded-md animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid xl:grid-cols-2 gap-5">
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  /* ================= EMPTY ================= */

  if (!forecast || !summary || !metrics) {
    return (
      <PageContainer>
        <PageHeader onBack={() => router.push("/dashboard")} />
        <Card>
          <p className="text-sm text-slate-500">
            No forecast data yet. Create deals and move them through your
            pipeline to see your forecast.
          </p>
        </Card>
      </PageContainer>
    );
  }

  /* ================= UI ================= */

  return (
    <PageContainer>

      <PageHeader onBack={() => router.push("/dashboard")} />

      {/* HERO — real weighted forecast */}
      <Card className="bg-gradient-to-br from-slate-950 to-slate-800 text-white border-none">
        <h1 className="text-4xl font-bold tracking-tight">
          {formatMoney(summary.weightedForecast)}
        </h1>

        <p className="text-white/70 mt-2 text-sm">
          Weighted Forecast • Win rate {metrics.winRate}%
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div>
            <p className="text-white/60">Pipeline</p>
            <p className="tabular-nums">{formatMoney(summary.totalPipelineValue)}</p>
          </div>
          <div>
            <p className="text-white/60">Commit</p>
            <p className="tabular-nums">{formatMoney(summary.commitForecast)}</p>
          </div>
          <div>
            <p className="text-white/60">Best Case</p>
            <p className="tabular-nums">{formatMoney(summary.bestCaseForecast)}</p>
          </div>
          <div>
            <p className="text-white/60">Open Deals</p>
            <p className="tabular-nums">{metrics.openDeals}</p>
          </div>
        </div>
      </Card>

      {/* KEY METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <Card>
          <p className="text-xs text-slate-500">Pipeline Health</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
            {Math.round(metrics.pipelineHealth * 100)}%
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Conversion</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{metrics.conversionRate}%</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Overdue</p>
          <p className="mt-1 text-lg font-semibold text-red-500 tabular-nums">
            {metrics.overdueDeals}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Stalled</p>
          <p className="mt-1 text-lg font-semibold text-amber-500 tabular-nums">
            {metrics.stalledDeals}
          </p>
        </Card>
      </div>

      {/* CHART + RISK */}
      <div className="grid xl:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Weighted Forecast by Stage</h3>
          <RevenueChart data={chartData} />
        </Card>

        <Card>
          <RiskInsight deals={riskDeals} />
        </Card>
      </div>

      {/* INSIGHTS — real structured insights from the engine */}
      <Card>
        <h3 className="font-semibold text-slate-900 mb-3">Forecast Insights</h3>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            No insights yet — check back as your pipeline fills up
          </p>
        ) : (
          <div className="space-y-2.5">
            {insights.map((ins, idx) => (
              <div
                key={idx}
                onClick={() => ins.reasoning && setSelected(ins)}
                className={`p-3.5 rounded-xl border border-slate-200 transition-colors ${
                  ins.reasoning ? "cursor-pointer hover:bg-slate-50 hover:border-slate-300" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${insightColor(ins.level)}`}>
                    {ins.message}
                  </p>
                  {ins.reasoning && <ArrowRight size={14} className="text-slate-400 shrink-0 ml-2" />}
                </div>
                <p className="text-[11px] text-slate-400 uppercase mt-1 tracking-wide">
                  {ins.category} • {ins.level}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* INSIGHT REASONING MODAL */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className={`font-semibold text-lg ${insightColor(selected.level)}`}>
                {selected.message}
              </h2>

              <div className="mt-3 text-sm text-slate-600 space-y-1.5">
                {(selected.reasoning ?? []).map((r, i) => (
                  <p key={i}>• {r}</p>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </PageContainer>
  );
}