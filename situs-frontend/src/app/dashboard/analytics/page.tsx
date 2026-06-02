"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import MetricCard from "../../../components/dashboard/metric-card";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

import { apiFetch } from "@/lib/api";

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-slate-50">
    <div className="max-w-7xl mx-auto p-6 space-y-8">
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
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-2xl border bg-white shadow-sm p-5 ${className}`}
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

const formatMoney = (v?: number) => `₹${(v ?? 0).toLocaleString()}`;

const EMPTY_SUMMARY: Summary = {
  totalRevenue: 0,
  revenueAtRisk: 0,
  avgConversion: 0,
  totalDeals: 0,
};

export default function AnalyticsPage() {
  const router = useRouter();

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

  if (loading)
    return <div className="p-6 text-slate-400">Loading analytics...</div>;

  if (error) return <div className="p-6 text-red-500">{error}</div>;

  if (!data) return null;

  return (
    <PageContainer>
      <div>
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-black mb-2"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-semibold">Revenue Analytics</h1>

        <p className="text-sm text-slate-500">
          AI-driven insights across your pipeline
        </p>
      </div>

      <Card className="bg-gradient-to-br from-slate-950 to-slate-800 text-white border-none">
        <h2 className="text-4xl font-bold">
          {formatMoney(data.summary.totalRevenue)}
        </h2>

        <p className="text-white/70 mt-2">
          Total Revenue • Conversion {data.summary.avgConversion}%
        </p>

        <p className="text-sm text-white/60 mt-3">
          {data.insights?.[insightIndex] || "No insights"}
        </p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card><MetricCard title="Revenue" value={formatMoney(data.summary.totalRevenue)} /></Card>
        <Card><MetricCard title="At Risk" value={formatMoney(data.summary.revenueAtRisk)} /></Card>
        <Card><MetricCard title="Conversion" value={`${data.summary.avgConversion}%`} /></Card>
        <Card><MetricCard title="Deals" value={`${data.summary.totalDeals}`} /></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <p className="text-xs text-red-500 font-semibold">RISK</p>
          <p className="mt-2 font-medium">
            {biggestRisk?.message || "No major risk"}
          </p>
        </Card>

        <Card>
          <p className="text-xs text-emerald-500 font-semibold">OPPORTUNITY</p>
          <p className="mt-2 font-medium">
            {biggestOpportunity?.message || "No strong opportunity"}
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold mb-4">Revenue Trend</h3>

        <div className="flex items-end gap-3 h-44">
          {revenueTrend.map((r, i) => {
            const height = (r.revenue / maxRevenue) * 100;

            return (
              <div key={i} className="flex-1 flex flex-col items-center">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  className={`w-full rounded ${
                    hoveredBar === i ? "bg-black" : "bg-slate-400"
                  }`}
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                />

                <span className="text-[10px] mt-1 text-slate-500">
                  {r.month}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {topActions.map((a, i) => (
          <Card key={i}>
            <p className="text-xs text-slate-500">{a.label}</p>
            <p className="mt-2 text-sm font-medium">{a.message}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="text-sm font-semibold mb-4">Funnel</h3>

        {funnelStages.map((stage) => (
          <div key={stage.id} className="mb-4">
            <div className="flex justify-between text-sm">
              <span>{stage.name}</span>
              <span>
                {stage.conversion !== null ? `${stage.conversion}%` : "-"}
              </span>
            </div>

            <div className="h-2 bg-slate-100 rounded mt-1">
              <div
                className="h-full bg-black"
                style={{ width: `${Math.min(stage.deals * 5, 100)}%` }}
              />
            </div>

            <p className="text-xs text-slate-500 mt-1">
              {formatMoney(stage.totalValue)} • {stage.avgDays} days
            </p>
          </div>
        ))}
      </Card>
    </PageContainer>
  );
}
