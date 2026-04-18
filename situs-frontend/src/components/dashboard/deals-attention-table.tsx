"use client";

import { motion as m } from "framer-motion";
import { AlertCircle, ChevronRight } from "lucide-react";
import { getRiskLevel } from "../../lib/deal-risk-engine";

/* ✅ SINGLE UI TYPE — exported so other components can import */
export type UIDeal = {
  id: string;
  name: string;
  riskScore: number;
  reasons: string[];
};

type Props = {
  deals: UIDeal[];
  onDealClickAction?: (deal: UIDeal) => void;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Risk band → visual treatment.
 * Maps whatever getRiskLevel().label returns to our color system.
 */
function getBandVisuals(label: string) {
  const normalized = label.toLowerCase();

  if (normalized === "critical" || normalized === "high") {
    return {
      bar: "bg-rose-500",
      chip: "text-rose-700 bg-rose-50 ring-rose-200/60",
      dot: "bg-rose-500",
      rowTint: "hover:bg-rose-50/30",
    };
  }

  if (normalized === "watch" || normalized === "medium") {
    return {
      bar: "bg-amber-500",
      chip: "text-amber-700 bg-amber-50 ring-amber-200/60",
      dot: "bg-amber-500",
      rowTint: "hover:bg-amber-50/30",
    };
  }

  // default / low / normal
  return {
    bar: "bg-emerald-500",
    chip: "text-emerald-700 bg-emerald-50 ring-emerald-200/60",
    dot: "bg-emerald-500",
    rowTint: "hover:bg-zinc-50",
  };
}

export default function DealsAttentionTable({
  deals,
  onDealClickAction,
}: Props) {
  /* EMPTY STATE */
  if (!deals || deals.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-white p-8 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 ring-1 ring-emerald-200/60 mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </div>
        <p className="text-[14px] font-medium text-zinc-900">
          No deals flagged
        </p>
        <p className="text-[12.5px] text-zinc-500 mt-0.5">
          Your pipeline is clean — keep the momentum going.
        </p>
      </div>
    );
  }

  return (
    <m.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden"
    >
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-black/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-900/[0.03] ring-1 ring-black/[0.06]">
            <AlertCircle
              className="w-3.5 h-3.5 text-zinc-700"
              strokeWidth={2}
            />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-zinc-900 tracking-tight">
              Deals Requiring Attention
            </h2>
            <p className="text-[12px] text-zinc-500">
              Opportunities flagged by the risk engine
            </p>
          </div>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400 tabular-nums">
          {deals.length} {deals.length === 1 ? "deal" : "deals"}
        </span>
      </header>

      {/* TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          {/* THEAD */}
          <thead>
            <tr className="border-b border-black/[0.04] bg-zinc-50/60">
              <th className="py-2.5 px-6 text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Company
              </th>
              <th className="py-2.5 px-4 text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Risk Score
              </th>
              <th className="py-2.5 px-4 text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Level
              </th>
              <th className="py-2.5 px-4 text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Reasons
              </th>
              <th className="py-2.5 px-4 w-10" />
            </tr>
          </thead>

          {/* TBODY */}
          <tbody className="divide-y divide-black/[0.04]">
            {deals.map(function (deal, i) {
              const risk = getRiskLevel(deal.riskScore);
              const v = getBandVisuals(risk.label);
              const clickable = Boolean(onDealClickAction);

              const rowClassName =
                "group transition-colors " +
                (clickable ? "cursor-pointer " : "") +
                v.rowTint;

              return (
                <m.tr
                  key={deal.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: 0.25,
                    delay: 0.05 + i * 0.03,
                  }}
                  onClick={function () {
                    if (onDealClickAction) onDealClickAction(deal);
                  }}
                  className={rowClassName}
                >
                  {/* Company */}
                  <td className="py-3.5 px-6 min-w-[180px]">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={"w-1.5 h-1.5 rounded-full shrink-0 " + v.dot}
                      />
                      <span className="text-[13.5px] font-medium text-zinc-900 truncate">
                        {deal.name}
                      </span>
                    </div>
                  </td>

                  {/* Risk Score — animated bar + number */}
                  <td className="py-3.5 px-4 min-w-[160px]">
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-1.5 w-20 rounded-full bg-zinc-100 overflow-hidden">
                        <m.div
                          initial={{ width: 0 }}
                          animate={{
                            width:
                              Math.min(Math.max(deal.riskScore, 0), 100) + "%",
                          }}
                          transition={{
                            duration: 0.7,
                            ease: EASE,
                            delay: 0.15 + i * 0.04,
                          }}
                          className={"absolute inset-y-0 left-0 " + v.bar}
                        />
                      </div>
                      <span className="text-[12.5px] font-medium text-zinc-800 tabular-nums min-w-[24px]">
                        {deal.riskScore}
                      </span>
                    </div>
                  </td>

                  {/* Level chip */}
                  <td className="py-3.5 px-4">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap " +
                        v.chip
                      }
                    >
                      {risk.label}
                    </span>
                  </td>

                  {/* Reasons */}
                  <td className="py-3.5 px-4 max-w-[320px]">
                    <span className="text-[12.5px] text-zinc-500 truncate block">
                      {deal.reasons && deal.reasons.length > 0
                        ? deal.reasons.join(", ")
                        : "—"}
                    </span>
                  </td>

                  {/* Chevron — only if clickable */}
                  <td className="py-3.5 px-4 pr-6">
                    {clickable && (
                      <ChevronRight
                        className="w-4 h-4 text-zinc-300 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition-all ml-auto"
                        strokeWidth={1.75}
                      />
                    )}
                  </td>
                </m.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </m.section>
  );
}