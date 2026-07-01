"use client";

import { motion as m } from "framer-motion";
import { Target, Sparkles, ChevronRight } from "lucide-react";
import { getRiskLevel } from "../../lib/deal-risk-engine";

/* ✅ SAME TYPE AS TABLE (kept for backwards compat) */
export type UIDeal = {
  id: string;
  name: string;
  riskScore: number;
  reasons: string[];
};

type FocusModeProps = {
  deals: UIDeal[];
  onDealClickAction?: (deal: UIDeal) => void;
};

const EASE = [0.16, 1, 0.3, 1] as const;

function getMomentum(riskScore: number) {
  if (riskScore >= 80) {
    return { arrow: "↓", label: "Falling", text: "text-rose-500" };
  }
  if (riskScore >= 50) {
    return { arrow: "→", label: "Stable", text: "text-zinc-400" };
  }
  return { arrow: "↑", label: "Improving", text: "text-emerald-600" };
}

function getBandVisuals(label: string) {
  const n = label.toLowerCase();
  if (n === "critical" || n === "high") {
    return {
      dot: "bg-rose-500",
      chip: "text-rose-700 bg-rose-50 ring-rose-200/60",
    };
  }
  if (n === "watch" || n === "medium") {
    return {
      dot: "bg-amber-500",
      chip: "text-amber-700 bg-amber-50 ring-amber-200/60",
    };
  }
  return {
    dot: "bg-emerald-500",
    chip: "text-emerald-700 bg-emerald-50 ring-emerald-200/60",
  };
}

export default function FocusMode({
  deals,
  onDealClickAction,
}: FocusModeProps) {
  return (
    <m.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white"
    >
      {/* Ambient emerald wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(500px 160px at 0% 0%, rgba(16,185,129,0.05), transparent 60%)",
        }}
      />

      {/* HEADER */}
      <div className="relative px-6 pt-5 pb-3 flex items-center justify-between border-b border-black/[0.04]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-50 ring-1 ring-emerald-200/60">
            <Target className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-[13.5px] font-semibold text-zinc-900 tracking-tight">
                Focus Mode
              </h2>
              <Sparkles className="w-3 h-3 text-emerald-500" strokeWidth={2} />
            </div>
            <p className="text-[11.5px] text-zinc-400 mt-0.5">
              Your highest-leverage actions right now
            </p>
          </div>
        </div>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-zinc-400">
          Priority · Now
        </span>
      </div>

      {/* LIST */}
      <div className="relative px-3 py-2">
        {!deals || deals.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-[13px] text-zinc-400">
              Nothing urgent. Go close something.
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {deals.map(function (deal, index) {
              const risk = getRiskLevel(deal.riskScore);
              const v = getBandVisuals(risk.label);
              const momentum = getMomentum(deal.riskScore);
              const clickable = Boolean(onDealClickAction);
              const topReason =
                deal.reasons && deal.reasons.length > 0
                  ? deal.reasons[0]
                  : "AI detected potential deal risk";

              return (
                <m.li
                  key={deal.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.2,
                    ease: EASE,
                    delay: 0.08 + index * 0.05,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (onDealClickAction) onDealClickAction(deal);
                    }}
                    className={
                      "group w-full flex items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors " +
                      (clickable
                        ? "cursor-pointer hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50"
                        : "")
                    }
                  >
                    {/* Rank numeral */}
                    <span className="w-6 text-[12px] font-semibold tabular-nums text-zinc-300 group-hover:text-zinc-400 transition-colors shrink-0">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    {/* Status dot */}
                    <span
                      className={"w-2 h-2 rounded-full shrink-0 " + v.dot}
                    />

                    {/* Deal + reason */}
                    <div className="flex-1 min-w-0">
                      <span className="text-[13.5px] font-medium text-zinc-900 truncate block leading-snug">
                        {deal.name}
                      </span>
                      <p className="text-[12px] text-zinc-400 truncate mt-0.5">
                        {topReason}
                      </p>
                    </div>

                    {/* Momentum */}
                    <span
                      className={
                        "hidden md:inline-flex items-center gap-1 text-[11.5px] font-medium shrink-0 " +
                        momentum.text
                      }
                    >
                      <span className="text-[13px] leading-none">
                        {momentum.arrow}
                      </span>
                      {momentum.label}
                    </span>

                    {/* Risk chip */}
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset tabular-nums shrink-0 " +
                        v.chip
                      }
                    >
                      {risk.label} · {deal.riskScore}
                    </span>

                    {/* Chevron */}
                    {clickable && (
                      <ChevronRight
                        className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 group-hover:translate-x-0.5 transition-all duration-150 shrink-0"
                        strokeWidth={1.75}
                      />
                    )}
                  </button>
                </m.li>
              );
            })}
          </ul>
        )}
      </div>
    </m.section>
  );
}