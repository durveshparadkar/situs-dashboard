"use client";

import { motion as m } from "framer-motion";
import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";

import { formatCurrency, OrgCurrency } from "@/lib/currency";

/* ================= TYPES ================= */

type PipelineStage = {
  stage: string;
  value: number;
};

interface PipelineHealthChartProps {
  data?: PipelineStage[];
  /** Org's currency. Defaults to INR (matches this component's original behavior). */
  currency?: OrgCurrency;
}

/* ================= DATA ================= */

const DEFAULT_DATA: PipelineStage[] = [
  { stage: "Prospect", value: 480000 },
  { stage: "Qualified", value: 320000 },
  { stage: "Proposal", value: 210000 },
  { stage: "Negotiation", value: 160000 },
  { stage: "Closing", value: 90000 },
];

const BAR_COLORS = [
  "#065F46",
  "#047857",
  "#059669",
  "#10B981",
  "#34D399",
];

const CURRENCY_SYMBOLS: Record<OrgCurrency, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/* ================= HELPERS ================= */

/* Abbreviated for axis ticks + bar labels + header total — reuses the
   shared app-wide formatter so INR shows Lakh/Crore consistently with
   every other chart/table in the app, not a generic K/M suffix. */
function formatShortMoney(value: number, currency: OrgCurrency): string {
  return formatCurrency(value, currency);
}

/* Full precision for the tooltip — exact figure, not abbreviated. */
function formatFullMoney(value: number, currency: OrgCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return symbol + value.toLocaleString(locale);
}

/* ================= COMPONENT ================= */

export default function PipelineHealthChart({
  data = DEFAULT_DATA,
  currency = "INR",
}: PipelineHealthChartProps) {
  const totalPipeline = data.reduce((sum, s) => sum + s.value, 0);

  /* ================= TOOLTIP (FIXED) ================= */

  const renderTooltip = (props: unknown) => {
  if (!props || typeof props !== "object") return null;

  const { active, payload, label } = props as {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  };

  if (!active || !payload || payload.length === 0) return null;

  const value = payload[0].value;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900">
        {formatFullMoney(value, currency)}
      </div>
    </div>
  );
};

  /* ================= UI ================= */

  return (
    <m.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
       className="rounded-2xl border border-slate-200 bg-white overflow-visible">
    
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Pipeline Health
            </p>
            <p className="text-xs text-slate-500">
              Revenue distribution
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase">Total</p>
          <p className="text-sm font-semibold text-slate-900">
            {formatShortMoney(totalPipeline, currency)}
          </p>
        </div>
      </div>

      {/* CHART */}
      <div className="p-4">
        <div className="w-full h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
  data={data}
  barSize={28}
  margin={{ top: 70, right: 20, left: 0, bottom: 10 }}
>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />

              <XAxis
                dataKey="stage"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#64748b" }}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                width={45}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickFormatter={(v: number) =>
                  formatShortMoney(v, currency)
                }
                  domain={[0, (max: number) => max * 1.4]} // prevents label cut
              />

              <Tooltip content={renderTooltip} />

              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}

                <LabelList
                  dataKey="value"
                  position="top"
                  offset={16}
                  formatter={(value: unknown) =>
                    formatShortMoney(Number(value), currency)
                  }
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fill: "#0f172a",
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </m.section>
  );
}