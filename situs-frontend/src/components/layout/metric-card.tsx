"use client";

import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: number | string;
  trend?: string;
  icon?: ReactNode;
}

export default function MetricCard({
  title,
  value,
  trend,
  icon,
}: MetricCardProps) {
  const formattedValue =
    typeof value === "number"
      ? value.toLocaleString("en-US")
      : value;

  const isPositive = trend?.includes("↑");
  const isNegative = trend?.includes("↓");

  return (
    <div className="group relative rounded-2xl bg-white/80 border border-slate-200/70 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">

      {/* Subtle surface gradient */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-300 bg-linear-to-br from-slate-100/50 via-transparent to-slate-200/40" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>

        {icon && (
          <div className="text-slate-400 group-hover:text-slate-700 transition">
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="relative z-10 mt-3 flex items-end gap-2">
        <h2
          suppressHydrationWarning
          className="text-3xl font-semibold tracking-tight text-slate-900"
        >
          {formattedValue}
        </h2>

        {/* Trend inline (better UX) */}
        {trend && (
          <span
            className={`text-xs font-medium ${
              isPositive
                ? "text-emerald-600"
                : isNegative
                ? "text-red-600"
                : "text-slate-500"
            }`}
          >
            {trend}
          </span>
        )}
      </div>

      {/* Bottom hint line (optional future use) */}
      <div className="relative z-10 mt-3 h-px w-full bg-slate-100 group-hover:bg-slate-200 transition" />
    </div>
  );
}