"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import RevenueChart from "../../../components/forecast/revenue-chart";
import RiskInsight from "../../../components/forecast/risk-insight";
import { ArrowLeft, ArrowRight, TrendingUp } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { formatCurrency, useOrgCurrency } from "@/lib/currency";

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

const insightColor = (level: ForecastInsight["level"]) => {
  if (level === "critical") return "text-red-600";
  if (level === "warning") return "text-amber-600";
  if (level === "positive") return "text-emerald-600";
  return "text-zinc-600";
};

const insightDot = (level: ForecastInsight["level"]) => {
  if (level === "critical") return "bg-red-500";
  if (level === "warning") return "bg-amber-500";
  if (level === "positive") return "bg-emerald-500";
  return "bg-zinc-400";
};

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">{children}</div>
);

const PageHeader = ({ onBack }: { onBack: () => void }) => (
  <div className="flex justify-between items-center">
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors mb-2 group"
      >
        <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
        Back
      </button>
      <h1 className="text-[28px] font-semibold text-zinc-900 tracking-tight">Forecast</h1>
    </div>
  </div>
);

/* Same Card language as Settings/Alerts/Analytics — consistent
   rounded-2xl + hover lift across the whole app. */
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
    className={`rounded-2xl border border-zinc-100 bg-white transition-all duration-200 hover:border-zinc-200 hover:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] p-5 ${className}`}
  >
    {children}
  </motion.div>
);

/* ================= PAGE ================= */

export default function ForecastPage() {
  const router = useRouter();
  const currency = useOrgCurrency();

  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [deals, setDeals] = useState<DealLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ForecastInsight | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
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

  const chartData = useMemo(
    () =>
      [...breakdown]
        .sort((a, b) => b.weightedValue - a.weightedValue)
        .slice(0, 5)
        .map((b) => ({ name: b.label || b.key, value: b.weightedValue })),
    [breakdown]
  );

  const riskDeals = useMemo(
    () => deals.map((d) => ({ risk: mapRisk(d.riskLevel), value: d.value })),
    [deals]
  );

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="h-4 w-16 bg-zinc-100 rounded-lg animate-pulse" />
        <div className="h-32 bg-zinc-50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid xl:grid-cols-2 gap-5">
          <div className="h-64 bg-zinc-50 rounded-2xl animate-pulse" />
          <div className="h-64 bg-zinc-50 rounded-2xl animate-pulse" />
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
          <p className="text-[13.5px] text-zinc-500">
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
      <Card className="bg-gradient-to-br from-zinc-950 to-zinc-800 text-white border-none">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={14} className="text-emerald-400" />
          <span className="text-[11px] text-white/50 font-medium uppercase tracking-wide">Weighted Forecast</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight tabular-nums">
          {formatCurrency(summary.weightedForecast, currency)}
        </h1>

        <p className="text-white/70 mt-2 text-[13.5px]">
          Win rate <span className="font-semibold text-white">{metrics.winRate}%</span>
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-[13px] pt-5 border-t border-white/10">
          <div>
            <p className="text-white/50">Pipeline</p>
            <p className="tabular-nums font-medium mt-0.5">{formatCurrency(summary.totalPipelineValue, currency)}</p>
          </div>
          <div>
            <p className="text-white/50">Commit</p>
            <p className="tabular-nums font-medium mt-0.5">{formatCurrency(summary.commitForecast, currency)}</p>
          </div>
          <div>
            <p className="text-white/50">Best Case</p>
            <p className="tabular-nums font-medium mt-0.5">{formatCurrency(summary.bestCaseForecast, currency)}</p>
          </div>
          <div>
            <p className="text-white/50">Open Deals</p>
            <p className="tabular-nums font-medium mt-0.5">{metrics.openDeals}</p>
          </div>
        </div>
      </Card>

      {/* KEY METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <Card>
          <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide">Pipeline Health</p>
          <p className="mt-1.5 text-[19px] font-semibold text-zinc-900 tabular-nums">
            {Math.round(metrics.pipelineHealth * 100)}%
          </p>
        </Card>
        <Card>
          <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide">Conversion</p>
          <p className="mt-1.5 text-[19px] font-semibold text-zinc-900 tabular-nums">{metrics.conversionRate}%</p>
        </Card>
        <Card>
          <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide">Overdue</p>
          <p className="mt-1.5 text-[19px] font-semibold text-red-500 tabular-nums">
            {metrics.overdueDeals}
          </p>
        </Card>
        <Card>
          <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide">Stalled</p>
          <p className="mt-1.5 text-[19px] font-semibold text-amber-500 tabular-nums">
            {metrics.stalledDeals}
          </p>
        </Card>
      </div>

      {/* CHART + RISK */}
      <div className="grid xl:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-[14px] font-semibold text-zinc-900 mb-4">Weighted Forecast by Stage</h3>
          <RevenueChart data={chartData} />
        </Card>

        <Card>
          <RiskInsight deals={riskDeals} />
        </Card>
      </div>

      {/* INSIGHTS — real structured insights from the engine */}
      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-900 mb-3.5">Forecast Insights</h3>
        {insights.length === 0 ? (
          <p className="text-[13.5px] text-zinc-400 py-4 text-center">
            No insights yet — check back as your pipeline fills up
          </p>
        ) : (
          <div className="space-y-2">
            {insights.map((ins, idx) => (
              <div
                key={idx}
                onClick={() => ins.reasoning && setSelected(ins)}
                className={`p-4 rounded-xl border border-zinc-100 transition-all duration-150 ${
                  ins.reasoning ? "cursor-pointer hover:bg-zinc-50 hover:border-zinc-200 active:scale-[0.99]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${insightDot(ins.level)}`} />
                    <p className={`text-[13.5px] font-medium truncate ${insightColor(ins.level)}`}>
                      {ins.message}
                    </p>
                  </div>
                  {ins.reasoning && <ArrowRight size={14} className="text-zinc-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-zinc-400 uppercase mt-1.5 tracking-wide pl-4.5 ml-[2px]">
                  {ins.category} <span className="mx-1">·</span> {ins.level}
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
            className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
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
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2 w-2 rounded-full ${insightDot(selected.level)}`} />
                <span className="text-[11px] text-zinc-400 uppercase tracking-wide font-medium">{selected.category}</span>
              </div>
              <h2 className={`font-semibold text-[16px] ${insightColor(selected.level)}`}>
                {selected.message}
              </h2>

              <div className="mt-3.5 text-[13.5px] text-zinc-600 space-y-2 leading-relaxed">
                {(selected.reasoning ?? []).map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-zinc-300 shrink-0">·</span>
                    <p>{r}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </PageContainer>
  );
}