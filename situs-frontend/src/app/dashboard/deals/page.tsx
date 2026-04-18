"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";

import MetricCard from "../../../components/dashboard/metric-card";
import DealDrawer from "../../../components/drawers/deal-drawer";
import { rankDealsByRisk } from "../../../lib/deal-risk-engine";

/* ================= TYPES ================= */

type Deal = {
  _id: string;
  title: string;
  value: number;
  probability: number;
};

type RankedDeal = {
  _id: string;
  name: string;
  value: number;
  probability: number;
  riskScore: number;
  lastActivityDays: number;
};

/* ================= HELPERS ================= */

function getMomentum(days: number) {
  if (days >= 10)
    return { icon: ArrowDownRight, color: "text-red-600", label: "Falling" };
  if (days >= 6)
    return { icon: ArrowRight, color: "text-slate-500", label: "Stable" };
  return {
    icon: ArrowUpRight,
    color: "text-emerald-600",
    label: "Improving",
  };
}

function getRiskColor(score: number) {
  if (score >= 70) return "text-red-600 bg-red-50";
  if (score >= 40) return "text-yellow-600 bg-yellow-50";
  return "text-emerald-600 bg-emerald-50";
}

/* ================= PAGE ================= */

export default function DealsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<RankedDeal | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"risk" | "value">("risk");

  /* ================= FETCH ================= */

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const res = await fetch("/api/deals");
        const json = await res.json();
        setDeals(json.data || json.deals || []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load deals");
      } finally {
        setLoading(false);
      }
    };

    fetchDeals();
  }, []);

  /* ================= TRANSFORM ================= */

  const rankedDeals: RankedDeal[] = useMemo(() => {
    if (!deals.length) return [];

    const formatted = deals.map((d) => ({
      name: d.title,
      value: d.value,
      stage: "active",
      lastActivityDays: 3,
    }));

    const ranked = rankDealsByRisk(formatted);

    // safer mapping using index
    return ranked.map((r, i) => {
      const original = deals[i];

      return {
        _id: original?._id || r.name,
        name: r.name,
        value: original?.value ?? 0,
        probability: original?.probability ?? 0,
        riskScore: r.riskScore,
        lastActivityDays: 3,
      };
    });
  }, [deals]);

  /* ================= FILTER + SORT ================= */

  const filteredDeals = useMemo(() => {
    let result = rankedDeals.filter((d) =>
      d.name.toLowerCase().includes(search.toLowerCase())
    );

    result = [...result]; // avoid mutation

    if (sortBy === "risk") {
      result.sort((a, b) => b.riskScore - a.riskScore);
    } else {
      result.sort((a, b) => b.value - a.value);
    }

    return result;
  }, [rankedDeals, search, sortBy]);

  /* ================= AUTO SCROLL ================= */

  useEffect(() => {
    if (!highlightId) return;

    const el = document.getElementById(highlightId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, filteredDeals]);

  /* ================= METRICS ================= */

  const pipelineValue = useMemo(
    () => deals.reduce((sum, d) => sum + d.value, 0),
    [deals]
  );

  const dealsAtRisk = useMemo(
    () => rankedDeals.filter((d) => d.riskScore >= 70).length,
    [rankedDeals]
  );

  /* ================= UI ================= */

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">Loading deals...</div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">

      {/* HEADER */}
      <div className="space-y-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-semibold text-slate-900">Deals</h1>
        <p className="text-sm text-slate-500">
          Track deal health, risk, and expected revenue.
        </p>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard title="Total Deals" value={deals.length.toString()} />
        <MetricCard
          title="Pipeline Value"
          value={`₹${pipelineValue.toLocaleString()}`}
        />
        <MetricCard title="At Risk" value={dealsAtRisk.toString()} />
      </div>

      {/* CONTROLS */}
      <div className="flex gap-3">
        <input
          placeholder="Search deals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "risk" | "value")}
          className="border border-slate-200 px-3 py-2 rounded-lg text-sm"
        >
          <option value="risk">Risk</option>
          <option value="value">Value</option>
        </select>
      </div>

      {/* LIST */}
      <div className="space-y-3">
        {filteredDeals.length === 0 ? (
          <div className="border rounded-xl py-16 text-center text-sm text-slate-500">
            No deals found
          </div>
        ) : (
          filteredDeals.map((deal, index) => {
            const isHighlighted = deal._id === highlightId;
            const momentum = getMomentum(deal.lastActivityDays);
            const Icon = momentum.icon;

            const weighted = Math.round(
              (deal.value * deal.probability) / 100
            );

            return (
              <motion.div
                key={deal._id}
                id={deal._id}
                initial={{ opacity: 0, y: 6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: isHighlighted ? 1.03 : 1,
                }}
                transition={{ delay: index * 0.025 }}
                onClick={() => setSelectedDeal(deal)}
                className={`group border rounded-xl p-4 bg-white cursor-pointer transition
                  ${
                    isHighlighted
                      ? "border-blue-500 shadow-md ring-1 ring-blue-200"
                      : "hover:shadow-sm"
                  }`}
              >
                <div className="flex justify-between items-start">

                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">
                      {deal.name}
                    </p>

                    <div className="flex gap-2 items-center">
                      <span
                        className={`text-xs px-2 py-1 rounded ${getRiskColor(
                          deal.riskScore
                        )}`}
                      >
                        Risk {deal.riskScore}
                      </span>

                      <span className={'text-xs flex items-center gap-1 ' + momentum.color}>
                        <Icon size={12} />
                        {momentum.label}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{deal.value.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      ₹{weighted.toLocaleString()} expected
                    </p>
                  </div>

                </div>

                <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900"
                    style={{ width: `${deal.probability}%` }}
                  />
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* DRAWER */}
      <DealDrawer
        deal={selectedDeal}
        onClose={() => setSelectedDeal(null)}
        onUpdate={() => {}}
      />
    </div>
  );
}