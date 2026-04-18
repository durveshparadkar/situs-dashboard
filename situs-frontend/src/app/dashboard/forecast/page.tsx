"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import RevenueChart from "../../../components/forecast/revenue-chart";
import RiskInsight from "../../../components/forecast/risk-insight";
import { ArrowLeft, ArrowRight } from "lucide-react";

/* ================= TYPES ================= */

type ApiDeal = {
  _id: string;
  title: string;
  value: number;
  probability?: number;
  owner?: string;
};

type ForecastApiResponse = {
  success: boolean;
  data: {
    deals: ApiDeal[];
    summary: {
      weightedForecast: number;
      totalPipelineValue: number;
    };
  };
};

type ForecastDeal = {
  id: string;
  name: string;
  owner: string;
  value: number;
  probability: number;
  stage: "Qualified" | "Proposal" | "Negotiation";
  risk: "Low" | "Medium" | "High";
  weighted: number;
};

/* ================= HELPERS ================= */

function getRisk(prob: number) {
  if (prob >= 70) return "Low";
  if (prob >= 40) return "Medium";
  return "High";
}

function getStage(prob: number) {
  if (prob >= 70) return "Negotiation";
  if (prob >= 40) return "Proposal";
  return "Qualified";
}

/* ================= UI ================= */

function SurfaceCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className={`rounded-3xl border border-slate-200 p-6 shadow-sm ${className}`}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ================= PAGE ================= */

export default function ForecastPage() {
  const router = useRouter();

  const [data, setData] = useState<ForecastApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // ✅ NEW: selected deal
  const [selectedDeal, setSelectedDeal] = useState<ForecastDeal | null>(null);

  const [form, setForm] = useState({
    title: "",
    value: "",
    probability: "",
  });

  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => r.json())
      .then((json) => setData(json.data))
      .finally(() => setLoading(false));
  }, []);

  /* ================= DATA ================= */

  const deals: ForecastDeal[] = useMemo(() => {
    if (!data?.deals) return [];

    return data.deals.map((d) => {
      const prob = d.probability ?? 50;

      return {
        id: d._id,
        name: d.title,
        owner: d.owner || "User",
        value: d.value,
        probability: prob,
        stage: getStage(prob),
        risk: getRisk(prob),
        weighted: Math.round((d.value * prob) / 100),
      };
    });
  }, [data]);

  const expected = data?.summary?.weightedForecast ?? 0;
  const pipeline = data?.summary?.totalPipelineValue ?? 0;

  const confidence =
    deals.length > 0
      ? Math.round(
          deals.reduce((s, d) => s + d.probability, 0) / deals.length
        )
      : 0;

  const riskDeals = deals.filter((d) => d.risk === "High").length;

  const topDeals = [...deals]
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 3);

  /* ================= AI ================= */

  const aiInsight = useMemo(() => {
    if (deals.length === 0) return "No forecast data available.";

    return `Revenue is projected from ${deals.length} deals. Strong momentum from ${topDeals.map(d => d.name).join(", ")}. ${riskDeals} deals may impact results.`;
  }, [deals, topDeals, riskDeals]);

  /* ================= ACTIONS ================= */

  const topActions = useMemo(() => {
    if (deals.length === 0) return [];

    const actions = [];

    const weakBigDeals = deals.filter(d => d.value > 30000 && d.probability < 50);
    if (weakBigDeals.length > 0) {
      actions.push({
        title: "Improve high-value deals",
        desc: weakBigDeals.slice(0,2).map(d => d.name).join(", "),
      });
    }

    const closingDeals = deals.filter(d => d.probability >= 70);
    if (closingDeals.length > 0) {
      actions.push({
        title: "Close near-win deals",
        desc: closingDeals.slice(0,2).map(d => d.name).join(", "),
      });
    }

    if (riskDeals > 0) {
      actions.push({
        title: "Reduce risk",
        desc: `${riskDeals} deals are high risk`,
      });
    }

    return actions.slice(0,3);
  }, [deals, riskDeals]);

  const chartData = deals.slice(0,5).map((d, i) => ({
    name: `Deal ${i+1}`,
    value: d.weighted,
  }));

  if (loading) return <div className="p-6">Loading forecast...</div>;

  /* ================= UI ================= */

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-6 py-6">

      {/* HEADER */}
      <header className="space-y-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold">Forecast</h1>
            <p className="text-sm text-slate-500">
              Predict and optimize your revenue
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm"
          >
            + Add Deal
          </button>
        </div>
      </header>

      {/* HERO */}
      <SurfaceCard
        className="text-white border-none shadow-lg"
        style={{
          background: "linear-gradient(to bottom right, #0f172a, #1e293b)",
        }}
      >
        <div className="flex justify-between">
          <div>
            <p className="text-sm opacity-70">Projected Revenue</p>
            <h2 className="text-4xl font-bold mt-2">
              ₹{expected.toLocaleString()}
            </h2>

            <p className="text-sm mt-4 opacity-80 max-w-xl">
              {aiInsight}
            </p>
          </div>

          <div className="text-right text-sm opacity-80">
            <p>Pipeline: ₹{pipeline.toLocaleString()}</p>
            <p className="mt-2">Confidence: {confidence}%</p>
          </div>
        </div>
      </SurfaceCard>

      {/* ACTIONS */}
      {topActions.length > 0 && (
        <section className="grid md:grid-cols-3 gap-4">
          {topActions.map((a, i) => (
            <SurfaceCard key={i} className="bg-white">
              <p className="text-sm font-medium">{a.title}</p>
              <p className="text-xs text-slate-500 mt-1">{a.desc}</p>
            </SurfaceCard>
          ))}
        </section>
      )}

      {/* CHART + RISK */}
      <section className="grid xl:grid-cols-2 gap-6">
        <SurfaceCard className="bg-white">
          <RevenueChart data={chartData} />
        </SurfaceCard>

        <SurfaceCard className="bg-white">
          <p className="text-xs uppercase text-slate-500 mb-4">
            Risk Overview
          </p>
          <RiskInsight deals={deals} />
          <p className="text-sm text-red-500 mt-4">
            {riskDeals} deals at risk
          </p>
        </SurfaceCard>
      </section>

      {/* DEALS */}
      <section className="grid xl:grid-cols-2 gap-6">
        {deals.map((d) => (
          <SurfaceCard key={d.id} className="bg-white">

            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold">{d.name}</h3>
                <p className="text-sm text-slate-500">{d.owner}</p>
              </div>

              <div className="flex gap-2">

                {/* ✅ FIXED */}
                <button
                  onClick={() => setSelectedDeal(d)}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <ArrowRight size={14} />
                </button>

                <button
                  onClick={async () => {
                    await fetch("/api/deals", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: d.id }),
                    });

                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            deals: prev.deals.filter(
                              (deal) => deal._id !== d.id
                            ),
                          }
                        : prev
                    );
                  }}
                  className="text-red-500 text-xs"
                >
                  ✕
                </button>

              </div>
            </div>

            <p className="mt-4 text-lg font-semibold">
              ₹{d.value.toLocaleString()}
            </p>

            <p className="text-sm text-slate-500">
              {d.probability}%
            </p>

            <div className="mt-3 h-2 bg-slate-100 rounded-full">
              <div
                className="h-full bg-slate-900"
                style={{ width: `${d.probability}%` }}
              />
            </div>

          </SurfaceCard>
        ))}
      </section>

      {/* ✅ DEAL DETAILS MODAL */}
      <AnimatePresence>
        {selectedDeal && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={() => setSelectedDeal(null)}
          >
            <div
              className="bg-white p-6 rounded-2xl w-96"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-semibold text-lg">Deal Details</h2>

              <p className="mt-4 font-medium">{selectedDeal.name}</p>
              <p className="text-sm text-slate-500">{selectedDeal.owner}</p>

              <p className="mt-3">
                ₹{selectedDeal.value.toLocaleString()}
              </p>

              <p className="text-sm mt-1">
                {selectedDeal.probability}% probability
              </p>

              <button
                onClick={() => setSelectedDeal(null)}
                className="w-full mt-4 bg-slate-900 text-white py-2 rounded-xl"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADD MODAL (UNCHANGED) */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={() => setShowAddModal(false)}
          >
            <div
              className="bg-white p-6 rounded-2xl w-96"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-semibold text-lg">Add Deal</h2>

              <input
                placeholder="Title"
                className="w-full border rounded-xl px-3 py-2 mt-4"
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
              />

              <input
                type="number"
                placeholder="Value"
                className="w-full border rounded-xl px-3 py-2 mt-3"
                value={form.value}
                onChange={(e) =>
                  setForm({ ...form, value: e.target.value })
                }
              />

              <input
                type="number"
                placeholder="Probability %"
                className="w-full border rounded-xl px-3 py-2 mt-3"
                value={form.probability}
                onChange={(e) =>
                  setForm({ ...form, probability: e.target.value })
                }
              />

              <button
                onClick={async () => {
                  const res = await fetch("/api/deals", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: form.title,
                      value: Number(form.value),
                      probability: Number(form.probability),
                      owner: "You",
                    }),
                  });

                  const result = await res.json();

                  setData((prev) =>
                    prev
                      ? { ...prev, deals: [...prev.deals, result.data] }
                      : prev
                  );

                  setShowAddModal(false);
                  setForm({ title: "", value: "", probability: "" });
                }}
                className="w-full bg-slate-900 text-white py-2 rounded-xl mt-4"
              >
                Create Deal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}