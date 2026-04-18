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
  if (v >= 10_000_000) return symbol + (v / 10_000_000).toFixed(2) + "Cr";
  if (v >= 100_000) return symbol + (v / 100_000).toFixed(2) + "L";
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
    c >= 75 ? "#059669" : c >= 50 ? "#D97706" : "#E11D48";

  const path =
    `M ${stroke / 2} ${cy}
     A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`;

  return (
    <div className="relative flex items-end justify-center">
      <svg width={size} height={size / 2}>
        <path d={path} stroke="#E5E7EB" strokeWidth={stroke} fill="none" strokeLinecap="round" />
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

      <div className="absolute bottom-0 text-xl font-semibold">
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
    prevActual ? ((expectedRevenue - prevActual) / prevActual) * 100 : null;

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex flex-col"
    >
      {/* CARD ROOT (IMPORTANT FIX) */}
      <div className="h-full flex flex-col justify-between rounded-2xl border border-slate-200 bg-white">

        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold">Revenue Forecast</p>
              <p className="text-xs text-slate-500">
                AI-predicted revenue
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400 uppercase">
            Forecast
          </span>
        </div>

        {/* MAIN CONTENT (STRETCHES) */}
        <div className="flex-1 flex items-center px-5 py-4">
          <div className="grid grid-cols-2 w-full items-center">

            {/* LEFT */}
            <div>
              <p className="text-xs text-slate-500 mb-1">
                Expected Revenue
              </p>

              <div className="text-3xl font-bold">
                {formatMoney(expectedRevenue, currencySymbol)}
              </div>

              {delta !== null && (
                <div className="text-xs text-emerald-600 mt-1">
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}%
                </div>
              )}

              <div className="mt-4 text-sm">
                <div>Deals: {dealsLikely}</div>
                <div>Confidence: Strong</div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="flex justify-end">
              <ConfidenceGauge confidence={confidence} />
            </div>

          </div>
        </div>

        {/* FOOTER (STICKS TO BOTTOM) */}
        <div className="px-5 py-4 border-t">
          <div className="flex justify-between text-xs mb-2">
            <span>Forecast Confidence</span>
            <span>{confidence}%</span>
          </div>

          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>

      </div>
    </m.div>
  );
}