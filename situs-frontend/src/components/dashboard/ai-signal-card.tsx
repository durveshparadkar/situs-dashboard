"use client";

import { useState, useEffect } from "react";
import { motion as m, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "../ui/card";
import {
  AlertTriangle,
  TrendingUp,
  Info,
  ArrowRight,
  X,
  Mail,
  Zap,
} from "lucide-react";

type SignalType = "risk" | "opportunity" | "info";
type SignalPriority = "critical" | "watch" | "normal";

interface AISignalCardProps {
  type?: SignalType;
  priority?: SignalPriority;
  title: string;
  insight: string;
  reason?: string;
  action?: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

const typeConfig: Record<
  SignalType,
  {
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    iconWrap: string;
    iconColor: string;
    dot: string;
  }
> = {
  risk: {
    Icon: AlertTriangle,
    iconWrap: "bg-rose-50 ring-rose-200/60",
    iconColor: "text-rose-600",
    dot: "bg-rose-500",
  },
  opportunity: {
    Icon: TrendingUp,
    iconWrap: "bg-emerald-50 ring-emerald-200/60",
    iconColor: "text-emerald-600",
    dot: "bg-emerald-500",
  },
  info: {
    Icon: Info,
    iconWrap: "bg-indigo-50 ring-indigo-200/60",
    iconColor: "text-indigo-600",
    dot: "bg-indigo-500",
  },
};

const priorityConfig: Record<
  SignalPriority,
  { label: string; chipClass: string; cardRing: string }
> = {
  critical: {
    label: "Critical",
    chipClass: "text-rose-700 bg-rose-50 ring-rose-200/60",
    cardRing: "ring-1 ring-rose-200/50",
  },
  watch: {
    label: "Watch",
    chipClass: "text-amber-700 bg-amber-50 ring-amber-200/60",
    cardRing: "",
  },
  normal: {
    label: "Normal",
    chipClass: "text-zinc-600 bg-zinc-100 ring-zinc-200/60",
    cardRing: "",
  },
};

export default function AISignalCard({
  type = "info",
  priority = "normal",
  title,
  insight,
  reason,
  action,
}: AISignalCardProps) {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const cfg = typeConfig[type];
  const pCfg = priorityConfig[priority];
  const Icon = cfg.Icon;

  // Close modal on Escape
  useEffect(
    function () {
      if (!activeModal) return;
      function handler(e: KeyboardEvent) {
        if (e.key === "Escape") setActiveModal(null);
      }
      window.addEventListener("keydown", handler);
      return function () {
        window.removeEventListener("keydown", handler);
      };
    },
    [activeModal]
  );

  const cardClassName =
    "group relative h-full rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-300 hover:-translate-y-0.5 hover:border-black/[0.10] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] overflow-hidden " +
    pCfg.cardRing;

  return (
    <>
      <Card className={cardClassName}>
        {/* subtle hover wash */}
        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-zinc-50/60 via-transparent to-transparent" />

        <CardContent className="relative z-10 p-5 flex flex-col h-full gap-3">
          {/* HEADER */}
          <div className="flex items-start justify-between gap-3">
            <div
              className={
                "flex items-center justify-center w-8 h-8 rounded-lg ring-1 ring-inset " +
                cfg.iconWrap
              }
            >
              <Icon
                className={"w-4 h-4 " + cfg.iconColor}
                strokeWidth={2}
              />
            </div>
            <span
              className={
                "text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full ring-1 ring-inset " +
                pCfg.chipClass
              }
            >
              {pCfg.label}
            </span>
          </div>

          {/* TITLE + INSIGHT */}
          <div>
            <h3 className="text-[14px] font-semibold text-zinc-900 tracking-tight">
              {title}
            </h3>
            <p className="text-[12.5px] text-zinc-600 mt-1 leading-relaxed">
              {insight}
            </p>
          </div>

          {/* REASON — subtle left-border treatment */}
          {reason && (
            <div className="text-[11.5px] text-zinc-500 border-l-2 border-zinc-200 pl-2.5 leading-relaxed">
              <span className="font-medium text-zinc-700">Why: </span>
              {reason}
            </div>
          )}

          {/* ACTION — muted recommendation line */}
          {action && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-900">
              <span>{action}</span>
              <ArrowRight
                className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all"
                strokeWidth={2}
              />
            </div>
          )}

          {/* BUTTONS */}
          <div className="flex flex-wrap gap-2 mt-auto pt-3">
            <button
              onClick={function () {
                setActiveModal("meeting");
              }}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
            >
              <Zap className="w-3 h-3" strokeWidth={2.25} />
              Act Now
            </button>

            <button
              onClick={function () {
                setActiveModal("email");
              }}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-black/[0.08] text-zinc-700 hover:bg-zinc-50 hover:border-black/[0.14] transition-colors"
            >
              <Mail className="w-3 h-3" strokeWidth={2} />
              Email
            </button>
          </div>
        </CardContent>
      </Card>

      {/* MODAL */}
      <AnimatePresence>
        {activeModal && (
          <>
            {/* Backdrop */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={function () {
                setActiveModal(null);
              }}
              className="fixed inset-0 bg-zinc-900/30 backdrop-blur-sm z-50"
            />

            {/* Panel */}
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
              <m.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="pointer-events-auto w-full max-w-md rounded-2xl bg-white border border-black/[0.06] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.2)] overflow-hidden"
              >
                {/* Modal header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.05]">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={
                        "flex items-center justify-center w-7 h-7 rounded-lg ring-1 ring-inset " +
                        cfg.iconWrap
                      }
                    >
                      {activeModal === "meeting" ? (
                        <Zap
                          className={"w-3.5 h-3.5 " + cfg.iconColor}
                          strokeWidth={2}
                        />
                      ) : (
                        <Mail
                          className={"w-3.5 h-3.5 " + cfg.iconColor}
                          strokeWidth={2}
                        />
                      )}
                    </div>
                    <h3 className="text-[15px] font-semibold text-zinc-900 tracking-tight">
                      {activeModal === "meeting" && "Schedule Action"}
                      {activeModal === "email" && "Draft Email"}
                    </h3>
                  </div>
                  <button
                    onClick={function () {
                      setActiveModal(null);
                    }}
                    aria-label="Close"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                  >
                    <X className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>

                {/* Body */}
                <div className="px-5 py-5">
                  <p className="text-[13px] text-zinc-600 leading-relaxed">
                    This action will be integrated into your workflow system
                    and routed to the connected CRM.
                  </p>

                  {action && (
                    <div className="mt-4 rounded-xl border border-black/[0.06] bg-zinc-50/60 p-3.5">
                      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400 mb-1">
                        Recommended
                      </div>
                      <div className="text-[13px] font-medium text-zinc-900">
                        {action}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-black/[0.05] bg-zinc-50/40">
                  <button
                    onClick={function () {
                      setActiveModal(null);
                    }}
                    className="px-4 py-2 text-[13px] font-medium text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={function () {
                      setActiveModal(null);
                    }}
                    className="px-4 py-2 text-[13px] font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              </m.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}