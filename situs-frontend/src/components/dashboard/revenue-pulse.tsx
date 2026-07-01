"use client";

import { motion as m } from "framer-motion";
import { Activity } from "lucide-react";

type PulseStatus = "healthy" | "watch" | "critical";

interface RevenuePulseProps {
  status: PulseStatus;
  message: string;
  detail?: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

const statusConfig: Record<
  PulseStatus,
  {
    label: string;
    dot: string;
    ring: string;
    gradient: string;
    text: string;
    badgeClass: string;
  }
> = {
  healthy: {
    label: "Healthy",
    dot: "#10B981",
    ring: "rgba(16, 185, 129, 0.15)",
    gradient:
      "linear-gradient(90deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0) 55%)",
    text: "text-emerald-700",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
  watch: {
    label: "Watch",
    dot: "#F59E0B",
    ring: "rgba(245, 158, 11, 0.15)",
    gradient:
      "linear-gradient(90deg, rgba(245,158,11,0.05) 0%, rgba(245,158,11,0) 55%)",
    text: "text-amber-700",
    badgeClass: "bg-amber-50 text-amber-700 ring-amber-200/60",
  },
  critical: {
    label: "Critical",
    dot: "#F43F5E",
    ring: "rgba(244, 63, 94, 0.15)",
    gradient:
      "linear-gradient(90deg, rgba(244,63,94,0.06) 0%, rgba(244,63,94,0) 55%)",
    text: "text-rose-700",
    badgeClass: "bg-rose-50 text-rose-700 ring-rose-200/60",
  },
};

export default function RevenuePulse({
  status,
  message,
  detail,
}: RevenuePulseProps) {
  const cfg = statusConfig[status];

  return (
    <m.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white"
      style={{ backgroundImage: cfg.gradient }}
    >
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-40"
        style={{
          background: `linear-gradient(90deg, transparent, ${cfg.dot}, transparent)`,
        }}
      />

      <div className="flex items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-4 min-w-0">

          {/* Animated pulse dot */}
          <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
            <m.span
              className="absolute inset-0 rounded-full"
              style={{ background: cfg.ring }}
              animate={{ scale: [1, 2.6, 1], opacity: [0.7, 0, 0.7] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
            <span
              className="relative w-2 h-2 rounded-full"
              style={{ background: cfg.dot }}
            />
          </div>

          {/* Text content */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-zinc-400">
                Revenue Pulse
              </span>
              <span
                className={
                  "text-[10.5px] font-semibold uppercase tracking-[0.09em] px-2 py-0.5 rounded-full ring-1 ring-inset " +
                  cfg.badgeClass
                }
              >
                {cfg.label}
              </span>
            </div>
            <p className="text-[14.5px] font-medium text-zinc-900 truncate leading-snug">
              {message}
            </p>
            {detail && (
              <p className="text-[12.5px] text-zinc-400 mt-0.5 truncate">
                {detail}
              </p>
            )}
          </div>
        </div>

        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 text-zinc-400 shrink-0">
          <Activity className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="text-[11.5px] font-medium tabular-nums">Live</span>
        </div>
      </div>
    </m.div>
  );
}