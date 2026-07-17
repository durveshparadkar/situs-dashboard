"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import MetricCard from "../../../components/dashboard/metric-card";
import { ArrowLeft, AlertTriangle, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { apiFetch } from "@/lib/api";
import { formatCurrency, useOrgCurrency } from "@/lib/currency";

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-zinc-50/40">
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {children}
    </div>
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
    className={`rounded-2xl border border-zinc-100 bg-white transition-all duration-200 hover:border-zinc-200 hover:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] p-5 ${className}`}
  >
    {children}
  </motion.div>
);

type Summary = {
  totalRevenue: number;
  revenueAtRisk: number;
  avgConversion: number;
  totalDeals: number;
};

type Prediction = {
  message: string;
  priority: "high" | "medium" | "low";
  impactScore: number;
  label: string;
};

type FunnelStage = {
  id: string;
  name: string;
  deals: number;
  conversion: number | null;
  avgDays: number;
  totalValue: number;
};

type AnalyticsData = {
  summary: Summary;
  funnelStages: FunnelStage[];
  revenueTrend: { month: string; revenue: number }[];
  insights: string[];
  topActions: Prediction[];
};

const EMPTY_SUMMARY: Summary = {
  totalRevenue: 0,
  revenueAtRisk: 0,
  avgConversion: 0,
  totalDeals: 0,
};

export default function AnalyticsPage() {
  const router = useRouter();
  const currency = useOrgCurrency();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insightIndex, setInsightIndex] = useState(0);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const json = await apiFetch<{ success: boolean; data: AnalyticsData }>(
          "/api/analytics"
        );

        if (!json?.success || !json?.data) {
          throw new Error("Invalid API");
        }

        const d = json.data;
        setData({
          summary: d.summary ?? EMPTY_SUMMARY,
          funnelStages: Array.isArray(d.funnelStages) ? d.funnelStages : [],
          revenueTrend: Array.isArray(d.revenueTrend) ? d.revenueTrend : [],
          insights: Array.isArray(d.insights) ? d.insights : [],
          topActions: Array.isArray(d.topActions) ? d.topActions : [],
        });
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error && err.message.includes("Analytics requires")
            ? err.message
            : "Failed to load analytics"
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!data?.insights?.length) return;

    const interval = setInterval(() => {
      setInsightIndex((p) => (p + 1) % data.insights.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [data?.insights]);

  const revenueTrend = useMemo(() => data?.revenueTrend ?? [], [data]);
  const funnelStages = useMemo(() => data?.funnelStages ?? [], [data]);
  const topActions = useMemo(() => data?.topActions ?? [], [data]);

  const maxRevenue = useMemo(() => {
    if (!revenueTrend.length) return 1;
    return Math.max(...revenueTrend.map((r) => r.revenue || 0), 1);
  }, [revenueTrend]);

  const biggestRisk = topActions[0] || null;
  const biggestOpportunity =
    topActions.find((a) => a.priority === "low") || null;

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-16 bg-zinc-100 rounded-lg" />
          <div className="h-8 w-48 bg-zinc-100 rounded-lg" />
          <div className="h-4 w-64 bg-zinc-100 rounded-lg" />
        </div>
        <div className="h-32 bg-zinc-50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-56 bg-zinc-50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  /* ================= ERROR ================= */

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Card className="border-red-100 bg-red-50/50">
          <h2 className="text-[16px] font-semibold text-red-700">
            Unable to load analytics
          </h2>
          <p className="text-[13.5px] text-red-600 mt-1.5">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  /* ================= UI ================= */

  return (
    <PageContainer>
      <div>
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors mb-2 group"
        >
          <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>

        <h1 className="text-[28px] font-semibold text-zinc-900 tracking-tight">
          Revenue Analytics
        </h1>

        <p className="text-[14px] text-zinc-400 mt-1">
          AI-driven insights across your pipeline
        </p>
      </div>

      <Card className="bg-gradient-to-br from-zinc-950 to-zinc-800 text-white border-none">
        <h2 className="text-4xl font-bold tracking-tight">
          {formatCurrency(data.summary.totalRevenue, currency)}
        </h2>

        <p className="text-white/70 mt-2 text-[13.5px]">
          Total Revenue <span className="text-white/40 mx-1.5">·</span> Conversion {data.summary.avgConversion}%
        </p>

        <motion.p
          key={insightIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-[13px] text-white/60 mt-3 flex items-center gap-1.5"
        >
          <Sparkles size={12} className="shrink-0" />
          {data.insights?.[insightIndex] || "No insights"}
        </motion.p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <Card><MetricCard title="Revenue" value={formatCurrency(data.summary.totalRevenue, currency)} /></Card>
        <Card><MetricCard title="At Risk" value={formatCurrency(data.summary.revenueAtRisk, currency)} /></Card>
        <Card><MetricCard title="Conversion" value={`${data.summary.avgConversion}%`} /></Card>
        <Card><MetricCard title="Deals" value={`${data.summary.totalDeals}`} /></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card className="border-red-100">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-red-500" />
            <p className="text-[11px] text-red-500 font-semibold tracking-wide uppercase">Risk</p>
          </div>
          <p className="mt-2.5 text-[14px] font-medium text-zinc-900 leading-relaxed">
            {biggestRisk?.message || "No major risk"}
          </p>
        </Card>

        <Card className="border-emerald-100">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-emerald-500" />
            <p className="text-[11px] text-emerald-500 font-semibold tracking-wide uppercase">Opportunity</p>
          </div>
          <p className="mt-2.5 text-[14px] font-medium text-zinc-900 leading-relaxed">
            {biggestOpportunity?.message || "No strong opportunity"}
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-900 mb-4">Revenue Trend</h3>

        {revenueTrend.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-[13.5px] text-zinc-400">
            No revenue data yet
          </div>
        ) : (
          <div className="flex items-end gap-3 h-44">
            {revenueTrend.map((r, i) => {
              const height = (r.revenue / maxRevenue) * 100;

              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="relative w-full h-full flex flex-col justify-end">
                    {hoveredBar === i && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute -top-7 left-1/2 -translate-x-1/2 text-[11px] font-medium text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                      >
                        {formatCurrency(r.revenue, currency)}
                      </motion.div>
                    )}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className={`w-full rounded-lg transition-colors duration-150 ${
                        hoveredBar === i ? "bg-zinc-900" : "bg-zinc-200"
                      }`}
                      onMouseEnter={() => setHoveredBar(i)}
                      onMouseLeave={() => setHoveredBar(null)}
                    />
                  </div>

                  <span className="text-[10.5px] mt-2 text-zinc-400 font-medium">
                    {r.month}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {topActions.length > 0 && (
        <div className="grid md:grid-cols-3 gap-5">
          {topActions.map((a, i) => (
            <Card key={i}>
              <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide">{a.label}</p>
              <p className="mt-2 text-[13.5px] font-medium text-zinc-900 leading-relaxed">{a.message}</p>
            </Card>
          ))}
        </div>
      )}

      {/* FUNNEL — rebuilt for clarity:
          - Stage name is now actually shown (it was accidentally
            dropped in the last pass)
          - A one-line caption explains what the section means, since
            "Funnel" alone doesn't tell a first-time viewer what
            they're looking at
          - Conversion is color-coded (green/amber/red) so health
            reads at a glance, same pattern as severity elsewhere
          - Bar width now reflects the actual conversion % instead of
            an arbitrary "deals * 5" guess, so the bar means something
          - Deal count shown as a small pill badge, not buried in the
            caption text underneath */}
      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-900 mb-1">Funnel</h3>
        <p className="text-[12.5px] text-zinc-400 mb-5">
          How deals move through each stage — conversion is the share that reached the next stage
        </p>

        {funnelStages.length === 0 ? (
          <p className="text-[13.5px] text-zinc-400 text-center py-8">
            No funnel data yet
          </p>
        ) : (
          <div className="space-y-5">
            {funnelStages.map((stage) => {
              const conv = stage.conversion;
              const barWidth = conv !== null ? Math.min(Math.max(conv, 0), 100) : 0;

              const convColor =
                conv === null ? "text-zinc-400"
                  : conv >= 60 ? "text-emerald-600"
                  : conv >= 30 ? "text-amber-600"
                  : "text-red-500";

              const barColor =
                conv === null ? "bg-zinc-300"
                  : conv >= 60 ? "bg-emerald-500"
                  : conv >= 30 ? "bg-amber-500"
                  : "bg-red-400";

              return (
                <div key={stage.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium text-zinc-900">{stage.name}</span>
                      <span className="text-[11px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full font-medium tabular-nums">
                        {stage.deals} {stage.deals === 1 ? "deal" : "deals"}
                      </span>
                    </div>
                    <span className={`text-[13.5px] font-semibold tabular-nums ${convColor}`}>
                      {conv !== null ? `${conv}%` : "—"}
                    </span>
                  </div>

                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>

                  <p className="text-[12px] text-zinc-400 mt-1.5">
                    {formatCurrency(stage.totalValue, currency)} in this stage <span className="mx-1">·</span> {stage.avgDays} {stage.avgDays === 1 ? "day" : "days"} average
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
