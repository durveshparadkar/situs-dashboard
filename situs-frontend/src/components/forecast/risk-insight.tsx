"use client";

import { formatCurrency, useOrgCurrency } from "@/lib/currency";

type Deal = {
  risk: "Low" | "Medium" | "High";
  value: number;
};

export default function RiskInsight({ deals }: { deals: Deal[] }) {
  const currency = useOrgCurrency();

  /* ================= GROUPING ================= */

  const groups = {
    Low: deals.filter((d) => d.risk === "Low"),
    Medium: deals.filter((d) => d.risk === "Medium"),
    High: deals.filter((d) => d.risk === "High"),
  };

  const getTotal = (arr: Deal[]) =>
    arr.reduce((sum, d) => sum + d.value, 0);

  const totals = {
    Low: getTotal(groups.Low),
    Medium: getTotal(groups.Medium),
    High: getTotal(groups.High),
  };

  const grandTotal = totals.Low + totals.Medium + totals.High || 1;

  /* ================= CONFIG ================= */

  const items = [
    {
      label: "Low Risk",
      key: "Low" as const,
      dot: "bg-emerald-500",
    },
    {
      label: "Medium Risk",
      key: "Medium" as const,
      dot: "bg-amber-500",
    },
    {
      label: "High Risk",
      key: "High" as const,
      dot: "bg-red-500",
    },
  ];

  /* ================= UI ================= */

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {items.map((item) => {
        const count = groups[item.key].length;
        const total = totals[item.key];
        const percentage = Math.round((total / grandTotal) * 100);

        return (
          <div
            key={item.label}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            {/* HEADER */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                {item.label}
              </p>

              <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
            </div>

            {/* VALUE */}
            <p className="mt-3 text-xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(total, currency)}
            </p>

            {/* META */}
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{count} deals</span>
              <span>{percentage}% of pipeline</span>
            </div>

            {/* BAR */}
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${item.dot}`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* INSIGHT */}
            <p className="mt-3 text-xs text-slate-500 leading-5">
              {item.key === "High" &&
                "High-risk deals may impact forecast accuracy."}
              {item.key === "Medium" &&
                "Mid-risk deals need momentum to convert."}
              {item.key === "Low" &&
                "Strong confidence deals supporting forecast."}
            </p>
          </div>
        );
      })}
    </div>
  );
}