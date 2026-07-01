"use client";

import { motion as m } from "framer-motion";
import { TrendingUp } from "lucide-react";

type Props = {
  expectedRevenue: number;
  confidence: number;
  dealsLikely: number;
  prevActual?: number;
  currencySymbol?: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

function formatMoney(v: number, symbol: string) {
  if (v >= 10_000_000) return symbol + (v / 10_000_000).toFixed(1) + "Cr";
  if (v >= 100_000) return symbol + (v / 100_000).toFixed(1) + "L";
  if (v >= 1_000) return symbol + Math.round(v / 1_000) + "K";
  return symbol + v;
}

/* ================= GAUGE ================= */

function ConfidenceGauge({ confidence }: { confidence: number }) {
  const c = Math.max(0, Math.min(100, confidence));
  const size = 160;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const cy = size / 2;
  const circumference = Math.PI * radius;
  const offset = circumference - (c / 100) * circumference;

  const color =
    c >= 75 ? "#10B981" : c >= 50 ? "#F59E0B" : "#F43F5E";

  const labelColor =
    c >= 75
      ? "text-emerald-600"
      : c >= 50
      ? "text-amber-600"
      : "text-rose-600";

  const path = `M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`;

  return (
    <div className="relative flex items-end justify-center">
      <svg width={size} height={size / 2}>
        <path
          d={path}
          stroke="#F1F5F9"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />
        <m.path
          d={path}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: EASE }}
        />
      </svg>

      <div className={`absolute bottom-0 text-xl font-semibold tabular-nums ${labelColor}`}>
        {c}%
      </div>
    </div>
  );
}

/* ================= COMPONENT ================= */

export default function RevenueForecast({
  expectedRevenue,
  confidence,
  dealsLikely,
  prevActual,
  currencySymbol = "₹",
}: Props) {
  const delta =
    prevActual !== undefined && prevActual > 0
      ? ((expectedRevenue - prevActual) / prevActual) * 100
      : null;

  const confidenceLabel =
    confidence >= 75 ? "Strong" : confidence >= 50 ? "Moderate" : "Low";

  const confidenceBarColor =
    confidence >= 75
      ? "bg-emerald-500"
      : confidence >= 50
      ? "bg-amber-400"
      : "bg-rose-400";

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="h-full flex flex-col"
    >
      <div className="h-full flex flex-col justify-between rounded-2xl border border-slate-200 bg-white overflow-hidden">

        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-50 ring-1 ring-emerald-200/60">
              <TrendingUp className="w-4 h-4 text-emerald-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[13.5px] font-semibold text-slate-900 tracking-tight">
                Revenue Forecast
              </p>
              <p className="text-[11.5px] text-slate-400 mt-0.5">
                AI-predicted this month
              </p>
            </div>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
            Forecast
          </span>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex items-center px-5 py-5">
          <div className="grid grid-cols-2 w-full items-center gap-4">

            {/* LEFT */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
                Expected Revenue
              </p>

              <div className="text-[28px] font-bold text-slate-900 tracking-tight tabular-nums leading-none">
                {formatMoney(expectedRevenue, currencySymbol)}
              </div>

              {delta !== null && (
                <div
                  className={`text-[12px] font-medium mt-1.5 tabular-nums ${
                    delta >= 0 ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}% vs last period
                </div>
              )}

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] text-slate-400">Deals likely</span>
                  <span className="text-[11.5px] font-semibold text-slate-900 tabular-nums">
                    {dealsLikely}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] text-slate-400">Signal</span>
                  <span
                    className={`text-[11.5px] font-semibold tabular-nums ${
                      confidence >= 75
                        ? "text-emerald-600"
                        : confidence >= 50
                        ? "text-amber-600"
                        : "text-rose-500"
                    }`}
                  >
                    {confidenceLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT — Gauge */}
            <div className="flex justify-end">
              <ConfidenceGauge confidence={confidence} />
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/40">
          <div className="flex justify-between text-[11.5px] mb-2">
            <span className="text-slate-400 font-medium">Forecast Confidence</span>
            <span className="font-semibold text-slate-700 tabular-nums">
              {confidence}%
            </span>
          </div>

          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <m.div
              className={"h-full rounded-full " + confidenceBarColor}
              initial={{ width: 0 }}
              animate={{ width: `${confidence}%` }}
              transition={{ duration: 0.8, ease: EASE }}
            />
          </div>
        </div>

      </div>
    </m.div>
  );
}