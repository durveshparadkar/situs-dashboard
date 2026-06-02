"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import RevenueChart from "../../../components/forecast/revenue-chart";
import RiskInsight from "../../../components/forecast/risk-insight";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { apiFetch } from "@/lib/api";

/* ================= TYPES ================= */

type ApiDeal = {
  _id: string;
  title: string;
  value: number;
  probability?: number;
  owner?: string;
};

type ForecastDeal = {
  id: string;
  name: string;
  owner: string;
  value: number;
  baseProbability: number;
  aiProbability: number;
  weighted: number;
  score: number;
  explanation: string[];
  risk: "Low" | "Medium" | "High";
};

/* Backend deal shape (subset we read from /api/deals) */
type BackendDeal = {
  _id: string;
  title: string;
  value: number;
  probability?: number;
  assignedTo?: string;
  ownerId?: string;
  owner?: string;
};

/* ================= HELPERS ================= */

const formatMoney = (v: number) => `₹${v.toLocaleString()}`;

const getRisk = (p: number): ForecastDeal["risk"] =>
  p >= 75 ? "Low" : p >= 45 ? "Medium" : "High";

/* ================= AI ================= */

function calculateAI(base: number, value: number, max: number) {
  const weight = max ? value / max : 0;

  const aiProb = Math.min(
    95,
    Math.max(5, Math.round(base * 0.6 + weight * 100 * 0.4))
  );

  const explanation: string[] = [];

  if (weight > 0.7) explanation.push("High value deal boosts forecast");
  if (weight < 0.3) explanation.push("Low value reduces impact");
  if (aiProb > base) explanation.push("AI increased probability");
  if (aiProb < base) explanation.push("AI reduced probability");

  return { aiProb, explanation };
}

const score = (p: number, v: number, max: number) =>
  Math.round(p * 0.7 + (max ? (v / max) * 100 : 0) * 0.3);

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="max-w-7xl mx-auto p-6 space-y-8">{children}</div>
);

const PageHeader = ({
  onBack,
  title,
}: {
  onBack: () => void;
  title?: string;
}) => (
  <div className="flex justify-between items-center">
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-sm text-slate-500 hover:text-black"
    >
      <ArrowLeft size={16} />
      Back
    </button>

    {title && <h1 className="text-lg font-semibold">{title}</h1>}
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
    whileHover={{ y: -3 }}
    className={`rounded-2xl border bg-white shadow-sm p-5 transition ${className}`}
  >
    {children}
  </motion.div>
);

/* ================= PAGE ================= */

export default function ForecastPage() {
  const router = useRouter();

  const [deals, setRawDeals] = useState<ApiDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ForecastDeal | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        /* Forecast math runs client-side off the deal list.
           Source the deals from the migrated backend deals API. */
        const res = await apiFetch<{ success: boolean; data: BackendDeal[] }>(
          "/api/deals?limit=100"
        );

        const raw = Array.isArray(res?.data) ? res.data : [];

        /* Normalize backend deal → the ApiDeal shape this page expects */
        const normalized: ApiDeal[] = raw.map((d) => ({
          _id:         d._id,
          title:       d.title,
          value:       d.value,
          probability: d.probability,
          owner:       d.owner || d.assignedTo || d.ownerId || "User",
        }));

        setRawDeals(normalized);
      } catch (err) {
        console.error("Failed to load forecast deals", err);
        setRawDeals([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const forecastDeals: ForecastDeal[] = useMemo(() => {
    if (!deals.length) return [];

    const max = Math.max(...deals.map((d) => d.value || 0), 1);

    return deals
      .map((d) => {
        const base = d.probability ?? 50;

        const { aiProb, explanation } = calculateAI(base, d.value, max);

        return {
          id: d._id,
          name: d.title || "Untitled",
          owner: d.owner || "User",
          value: d.value || 0,
          baseProbability: base,
          aiProbability: aiProb,
          weighted: Math.round((d.value * aiProb) / 100),
          score: score(aiProb, d.value, max),
          explanation,
          risk: getRisk(aiProb),
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [deals]);

  const expected = forecastDeals.reduce((s, d) => s + d.weighted, 0);
  const pipeline = forecastDeals.reduce((s, d) => s + d.value, 0);
  const confidence = forecastDeals.length
    ? Math.round(
        forecastDeals.reduce((s, d) => s + d.aiProbability, 0) /
          forecastDeals.length
      )
    : 0;

  const riskDeals = forecastDeals.filter((d) => d.risk === "High").length;

  const chartData = forecastDeals.slice(0, 5).map((d) => ({
    name: d.name,
    value: d.weighted,
  }));

  const insights = [
    `${riskDeals} high-risk deals`,
    `Confidence ${confidence}%`,
    forecastDeals[0] ? `${forecastDeals[0].name} drives revenue` : "",
  ];

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <PageContainer>

      <PageHeader onBack={() => router.push("/dashboard")} />

      {/* HERO */}
      <Card className="bg-gradient-to-br from-slate-950 to-slate-800 text-white border-none">
        <h1 className="text-4xl font-bold">{formatMoney(expected)}</h1>

        <p className="text-white/70 mt-2">
          AI Forecast • Confidence {confidence}%
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div>
            <p className="text-white/60">Pipeline</p>
            <p>{formatMoney(pipeline)}</p>
          </div>
          <div>
            <p className="text-white/60">Deals</p>
            <p>{forecastDeals.length}</p>
          </div>
          <div>
            <p className="text-white/60">High Risk</p>
            <p className="text-red-400">{riskDeals}</p>
          </div>
          <div>
            <p className="text-white/60">Confidence</p>
            <p>{confidence}%</p>
          </div>
        </div>
      </Card>

      {/* AI INSIGHTS */}
      <Card>
        <h3 className="font-semibold mb-2">AI Insights</h3>
        <div className="text-sm text-slate-600 space-y-1">
          {insights.map((i, idx) => i && <p key={idx}>• {i}</p>)}
        </div>
      </Card>

      {/* CHART + RISK */}
      <div className="grid xl:grid-cols-2 gap-6">
        <Card>
          <RevenueChart data={chartData} />
        </Card>

        <Card>
          <RiskInsight deals={forecastDeals} />
        </Card>
      </div>

      {/* DEAL LIST */}
      <div className="grid md:grid-cols-2 gap-6">
        {forecastDeals.map((d) => (
          <Card key={d.id}>
            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{d.name}</p>
                <p className="text-xs text-slate-500">{d.owner}</p>
              </div>

              <button onClick={() => setSelected(d)}>
                <ArrowRight size={16} />
              </button>
            </div>

            <p className="mt-3 font-semibold">{formatMoney(d.value)}</p>

            <div className="mt-2 h-2 bg-slate-100 rounded-full">
              <div
                className="h-full bg-black rounded-full"
                style={{ width: `${d.aiProbability}%` }}
              />
            </div>

            <p className="text-xs mt-1 text-slate-500">
              AI {d.aiProbability}% • Score {d.score}
            </p>
          </Card>
        ))}
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="bg-white p-6 rounded-xl w-96"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-semibold text-lg">{selected.name}</h2>

              <p className="mt-2">{formatMoney(selected.value)}</p>

              <div className="mt-3 text-sm text-slate-600 space-y-1">
                {selected.explanation.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </PageContainer>
  );
}