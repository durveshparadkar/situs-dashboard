"use client";

import { motion as m } from "framer-motion";
import type { ComponentType, ReactNode } from "react";

type Tone = "neutral" | "positive" | "warning" | "risk";

interface MetricCardProps {
  title: string;
  value: string;

  /** NEW API — prefer these going forward */
  delta?: string;
  deltaLabel?: string;
  tone?: Tone;
  /** Numeric sparkline series, values can be any range — normalized internally */
  trendData?: number[];
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;

  /** LEGACY API — still supported so existing pages don't break */
  trend?: string;
  signal?: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

const toneStyles: Record<
  Tone,
  { accent: string; sparkStroke: string; chipClass: string }
> = {
  neutral: {
    accent: "bg-zinc-900",
    sparkStroke: "#18181B",
    chipClass: "bg-zinc-50 text-zinc-600 ring-zinc-200/70",
  },
  positive: {
    accent: "bg-emerald-500",
    sparkStroke: "#10B981",
    chipClass: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
  warning: {
    accent: "bg-amber-500",
    sparkStroke: "#F59E0B",
    chipClass: "bg-amber-50 text-amber-700 ring-amber-200/60",
  },
  risk: {
    accent: "bg-rose-500",
    sparkStroke: "#F43F5E",
    chipClass: "bg-rose-50 text-rose-700 ring-rose-200/60",
  },
};

function Sparkline({
  data,
  stroke,
}: {
  data: number[];
  stroke: string;
}) {
  if (!data || data.length < 2) return null;
  const w = 80;
  const h = 24;
  const min = Math.min.apply(null, data);
  const max = Math.max.apply(null, data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data
    .map(function (v, i) {
      return i * step + "," + (h - ((v - min) / range) * h);
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible opacity-70" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * MetricCard — premium KPI card.
 * Supports both the new (delta/tone/icon) and legacy (trend string/signal) APIs.
 */
export default function MetricCard({
  title,
  value,
  delta,
  deltaLabel,
  tone = "neutral",
  trendData,
  icon: Icon,
  trend,
  signal,
}: MetricCardProps) {
  // Derive tone from legacy trend string if tone not explicitly provided
  let effectiveTone: Tone = tone;
  if (tone === "neutral" && trend) {
    if (trend.indexOf("↓") !== -1) effectiveTone = "risk";
    else if (trend.indexOf("↑") !== -1) effectiveTone = "positive";
  }

  // Unified delta text — prefer new delta, fall back to legacy trend
  const deltaText = delta || trend;

  // Derive arrow direction from the text
  let direction: "up" | "down" | "flat" = "flat";
  if (deltaText) {
    const t = deltaText.trim();
    if (t.charAt(0) === "-" || t.indexOf("↓") !== -1) direction = "down";
    else if (t.charAt(0) === "+" || t.indexOf("↑") !== -1) direction = "up";
  }

  const styles = toneStyles[effectiveTone];

  const DeltaArrow: ReactNode =
    direction === "up" ? (
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 17 L17 7" />
        <path d="M8 7 H17 V16" />
      </svg>
    ) : direction === "down" ? (
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 7 L17 17" />
        <path d="M17 8 V17 H8" />
      </svg>
    ) : null;

  return (
    <m.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="group relative rounded-2xl border border-black/[0.06] bg-white p-5 transition-all hover:border-black/[0.10] hover:shadow-sm h-full flex flex-col"
    >
      {/* Left accent bar — lights up on hover */}
      <span
        className={
          "absolute left-0 top-4 bottom-4 w-[2.5px] rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 " +
          styles.accent
        }
      />

      {/* HEADER ROW */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <Icon className="w-3.5 h-3.5 text-zinc-400 shrink-0" strokeWidth={1.75} />
          )}
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-400 truncate">
            {title}
          </span>
        </div>
        {trendData && trendData.length >= 2 && (
          <Sparkline data={trendData} stroke={styles.sparkStroke} />
        )}
      </div>

      {/* VALUE */}
      <div className="text-[26px] font-semibold tracking-tight text-zinc-900 tabular-nums leading-none">
        {value}
      </div>

      {/* DELTA CHIP */}
      {deltaText && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset tabular-nums " +
              styles.chipClass
            }
          >
            {DeltaArrow}
            {deltaText}
          </span>
          {deltaLabel && (
            <span className="text-[11px] text-zinc-400">{deltaLabel}</span>
          )}
        </div>
      )}

      {/* LEGACY SIGNAL */}
      {signal && (
        <p className="mt-auto pt-3 text-[12px] text-zinc-500 border-t border-zinc-100 leading-snug">
          {signal}
        </p>
      )}
    </m.div>
  );
}