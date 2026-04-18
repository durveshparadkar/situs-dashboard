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
  { label: string; dot: string; ring: string; gradient: string; text: string }
> = {
  healthy: {
    label: "Healthy",
    dot: "#059669",
    ring: "rgba(5, 150, 105, 0.18)",
    gradient:
      "linear-gradient(90deg, rgba(5,150,105,0.04) 0%, rgba(5,150,105,0) 60%)",
    text: "text-emerald-700",
  },
  watch: {
    label: "Watch",
    dot: "#D97706",
    ring: "rgba(217, 119, 6, 0.18)",
    gradient:
      "linear-gradient(90deg, rgba(217,119,6,0.05) 0%, rgba(217,119,6,0) 60%)",
    text: "text-amber-700",
  },
  critical: {
    label: "Critical",
    dot: "#E11D48",
    ring: "rgba(225, 29, 72, 0.2)",
    gradient:
      "linear-gradient(90deg, rgba(225,29,72,0.06) 0%, rgba(225,29,72,0) 60%)",
    text: "text-rose-700",
  },
};

export default function RevenuePulse({
  status,
  message,
  detail,
}: RevenuePulseProps) {
  const cfg = statusConfig[status];

  const accentLineStyle = {
    background:
      "linear-gradient(90deg, transparent, " + cfg.dot + ", transparent)",
    opacity: 0.5,
  };

  return (
    <m.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white"
      style={{ backgroundImage: cfg.gradient }}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={accentLineStyle} />

      <div className="flex items-center justify-between gap-6 px-6 py-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
            <m.span
              className="absolute inset-0 rounded-full"
              style={{ background: cfg.ring }}
              animate={{ scale: [1, 2.4, 1], opacity: [0.6, 0, 0.6] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
            <span
              className="relative w-2 h-2 rounded-full"
              style={{ background: cfg.dot }}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Revenue Pulse
              </span>
              <span
                className={
                  "text-[11px] font-semibold uppercase tracking-[0.08em] " +
                  cfg.text
                }
              >
                {cfg.label}
              </span>
            </div>
            <div className="text-[15px] font-medium text-zinc-900 truncate">
              {message}
            </div>
            {detail && (
              <div className="text-[13px] text-zinc-500 mt-0.5 truncate">
                {detail}
              </div>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-zinc-400">
          <Activity className="w-4 h-4" strokeWidth={1.75} />
          <span className="text-[12px] tabular-nums">Live</span>
        </div>
      </div>
    </m.div>
  );
}