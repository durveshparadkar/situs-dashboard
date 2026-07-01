"use client";

import { useState } from "react";
import { motion as m } from "framer-motion";
import { AlertCircle, ChevronRight, X } from "lucide-react";
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

function getBandVisuals(label: string) {
  const normalized = label.toLowerCase();

  if (normalized === "critical" || normalized === "high") {
    return {
      bar: "bg-rose-500",
      chip: "text-rose-700 bg-rose-50 ring-rose-200/60",
      dot: "bg-rose-500",
      rowTint: "hover:bg-rose-50/20",
    };
  }

  if (normalized === "watch" || normalized === "medium") {
    return {
      bar: "bg-amber-500",
      chip: "text-amber-700 bg-amber-50 ring-amber-200/60",
      dot: "bg-amber-500",
      rowTint: "hover:bg-amber-50/20",
    };
  }

  return {
    bar: "bg-emerald-500",
    chip: "text-emerald-700 bg-emerald-50 ring-emerald-200/60",
    dot: "bg-emerald-500",
    rowTint: "hover:bg-zinc-50/80",
  };
}

export default function DealsAttentionTable({
  deals,
  onDealClickAction,
}: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleDeals = (deals ?? []).filter((d) => !dismissed.has(d.id));

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  /* EMPTY STATE */
  if (!visibleDeals || visibleDeals.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-white p-10 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 ring-1 ring-emerald-200/60 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
        </div>
        <p className="text-[14px] font-semibold text-zinc-900">
          No deals flagged
        </p>
        <p className="text-[12.5px] text-zinc-400 mt-1 leading-relaxed">
          Your pipeline is clean — keep the momentum going.
        </p>
      </div>
    );
  }

  return (
    <m.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden"
    >
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-black/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-900/[0.03] ring-1 ring-black/[0.06]">
            <AlertCircle
              className="w-4 h-4 text-zinc-600"
              strokeWidth={1.75}
            />
          </div>
          <div>
            <h2 className="text-[13.5px] font-semibold text-zinc-900 tracking-tight">
              Deals Requiring Attention
            </h2>
            <p className="text-[11.5px] text-zinc-400 mt-0.5">
              Flagged by the risk engine
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 tabular-nums">
          {visibleDeals.length}{" "}
          {visibleDeals.length === 1 ? "deal" : "deals"}
        </span>
      </header>

      {/* TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">

          {/* THEAD */}
          <thead>
            <tr className="border-b border-black/[0.04] bg-zinc-50/70">
              <th className="py-2.5 px-6 text-[10px] font-semibold uppercase tracking-[0.09em] text-zinc-400">
                Company
              </th>
              <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-zinc-400">
                Risk Score
              </th>
              <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-zinc-400">
                Level
              </th>
              <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-zinc-400">
                Reasons
              </th>
              <th className="py-2.5 px-4 w-20" />
            </tr>
          </thead>

          {/* TBODY */}
          <tbody className="divide-y divide-black/[0.04]">
            {visibleDeals.map(function (deal, i) {
              const risk = getRiskLevel(deal.riskScore);
              const v = getBandVisuals(risk.label);
              const clickable = Boolean(onDealClickAction);

              return (
                <m.tr
                  key={deal.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: 0.04 + i * 0.03,
                  }}
                  onClick={() => {
                    if (onDealClickAction) onDealClickAction(deal);
                  }}
                  className={
                    "group transition-colors " +
                    (clickable ? "cursor-pointer " : "") +
                    v.rowTint
                  }
                >
                  {/* Company */}
                  <td className="py-3.5 px-6 min-w-[180px]">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={"w-2 h-2 rounded-full shrink-0 " + v.dot}
                      />
                      <span className="text-[13px] font-medium text-zinc-900 truncate">
                        {deal.name}
                      </span>
                    </div>
                  </td>

                  {/* Risk Score */}
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
                            duration: 0.6,
                            ease: EASE,
                            delay: 0.12 + i * 0.04,
                          }}
                          className={"absolute inset-y-0 left-0 rounded-full " + v.bar}
                        />
                      </div>
                      <span className="text-[12px] font-semibold text-zinc-800 tabular-nums min-w-[24px]">
                        {deal.riskScore}
                      </span>
                    </div>
                  </td>

                  {/* Level chip */}
                  <td className="py-3.5 px-4">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap " +
                        v.chip
                      }
                    >
                      {risk.label}
                    </span>
                  </td>

                  {/* Reasons */}
                  <td className="py-3.5 px-4 max-w-[280px]">
                    <span className="text-[12px] text-zinc-400 truncate block leading-relaxed">
                      {deal.reasons && deal.reasons.length > 0
                        ? deal.reasons.join(" · ")
                        : "—"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 pr-6">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Dismiss alert"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(deal.id);
                        }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>

                      {clickable && (
                        <ChevronRight
                          className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 group-hover:translate-x-0.5 transition-all duration-150"
                          strokeWidth={1.75}
                        />
                      )}
                    </div>
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