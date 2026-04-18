"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MetricCard from "../../../components/dashboard/metric-card";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

/* ================= TYPES ================= */

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
  color: "red" | "yellow" | "green";
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
  predictions: Prediction[];
  topActions: Prediction[];
};

type ApiResponse = {
  success: boolean;
  data: AnalyticsData;
};

/* ================= HELPERS ================= */

const formatMoney = (v?: number) =>
  `₹${(v ?? 0).toLocaleString()}`;

/* ================= COMPONENT ================= */

export default function AnalyticsPage() {
  const router = useRouter();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insightIndex, setInsightIndex] = useState(0);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  /* ================= FETCH ================= */

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/analytics");

        const json: ApiResponse = await res.json();

        if (!json.success) {
          throw new Error("API failed");
        }

        setData(json.data);
      } catch (err) {
        console.error(err);
        setError("Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  /* ================= ROTATING INSIGHT ================= */

  useEffect(() => {
    if (!data?.insights?.length) return;

    const i = setInterval(() => {
      setInsightIndex((p) => (p + 1) % data.insights.length);
    }, 4000);

    return () => clearInterval(i);
  }, [data]);

  /* ================= SAFE DERIVED ================= */

  const maxRevenue = useMemo(() => {
    if (!data?.revenueTrend?.length) return 1;
    return Math.max(...data.revenueTrend.map((r) => r.revenue || 0), 1);
  }, [data]);

  const biggestRisk = data?.topActions?.[0];
  const biggestOpportunity = data?.topActions?.find(
    (a) => a.priority === "low"
  );

  /* ================= STATES ================= */

  if (loading) {
    return (
      <div className="p-10 text-slate-500 animate-pulse">
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-red-500">
        {error}
      </div>
    );
  }

  if (!data) return null;

  if (data.summary.totalDeals === 0 && !data.revenueTrend.length) {
    return (
      <div className="p-10 text-slate-500">
        No data available yet.
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="bg-slate-50 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-7xl mx-auto px-8 py-10 space-y-10"
      >

        {/* HEADER */}
        <header>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Back
          </motion.button>

          <h1 className="text-3xl font-semibold mt-2">
            Revenue Analytics
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            Clear visibility into growth, risk, and opportunity.
          </p>
        </header>

        {/* AI INSIGHT */}
        <motion.section
          key={insightIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-linear-to-r from-black to-slate-800 text-white rounded-2xl p-6 shadow-lg overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-white/10"
            animate={{ opacity: [0, 0.2, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          <p className="text-xs uppercase text-slate-300 font-semibold">
            AI SUMMARY
          </p>

          <h3 className="text-xl font-semibold mt-2">
            {data.insights?.[insightIndex] || "No insights available"}
          </h3>

          <p className="text-sm text-slate-300 mt-1">
            Biggest risk: {biggestRisk?.message || "None detected"}
          </p>
        </motion.section>

        {/* METRICS */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            ["Revenue", formatMoney(data.summary?.totalRevenue)],
            ["At Risk", formatMoney(data.summary?.revenueAtRisk)],
            ["Conversion", `${data.summary?.avgConversion ?? 0}%`],
            ["Deals", `${data.summary?.totalDeals ?? 0}`],
          ].map(([title, value], i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -2 }}
            >
              <MetricCard title={title} value={value} />
            </motion.div>
          ))}
        </section>

        {/* RISK VS OPPORTUNITY */}
        <section className="grid md:grid-cols-2 gap-6">
          <motion.div className="bg-white border rounded-2xl p-6 shadow-sm">
            <p className="text-xs text-red-600 font-semibold">RISK</p>
            <h3 className="mt-2 font-semibold">
              {biggestRisk?.message || "No major risk"}
            </h3>
          </motion.div>

          <motion.div className="bg-white border rounded-2xl p-6 shadow-sm">
            <p className="text-xs text-emerald-600 font-semibold">
              OPPORTUNITY
            </p>
            <h3 className="mt-2 font-semibold">
              {biggestOpportunity?.message || "No strong opportunity"}
            </h3>
          </motion.div>
        </section>

        {/* REVENUE TREND */}
        <section className="bg-white border rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Revenue Trend
          </h3>

          <div className="flex items-end gap-3 h-40">
            {data.revenueTrend.map((r, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{
                  height: `${(r.revenue / maxRevenue) * 100}%`,
                }}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
                className={`flex-1 rounded ${
                  hoveredBar === i ? "bg-black" : "bg-slate-400"
                }`}
              />
            ))}
          </div>
        </section>

        {/* PRIORITY ACTIONS */}
        <section className="grid md:grid-cols-3 gap-6">
          {data.topActions.map((p, i) => (
            <motion.div
              key={i}
              className="p-6 rounded-2xl border bg-white shadow-sm"
            >
              <span className="text-xs">{p.label}</span>
              <p className="mt-3 font-medium">{p.message}</p>
            </motion.div>
          ))}
        </section>

        {/* FUNNEL */}
        <section className="bg-white border rounded-2xl p-6 shadow-sm">
          <div className="space-y-4">
            {data.funnelStages.map((stage) => (
              <div key={stage.id}>
                <div className="flex justify-between text-sm">
                  <span>{stage.name}</span>
                  <span>
                    {stage.conversion
                      ? `${stage.conversion.toFixed(1)}%`
                      : "-"}
                  </span>
                </div>

                <div className="h-2 bg-slate-100 rounded mt-1">
                  <div
                    style={{
                      width: `${Math.min(stage.deals * 5, 100)}%`,
                    }}
                    className="h-full bg-black"
                  />
                </div>

                <p className="text-xs text-slate-500 mt-1">
                  {formatMoney(stage.totalValue)} • {stage.avgDays} days
                </p>
              </div>
            ))}
          </div>
        </section>

      </motion.div>
    </div>
  );
}