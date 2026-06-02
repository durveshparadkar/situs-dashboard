"use client";

import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  WifiOff,
} from "lucide-react";

/* =====================================================
   TYPES
===================================================== */

export type SyncState =
  | "connected"
  | "syncing"
  | "delayed"
  | "disconnected";

interface SyncStatusProps {
  status: SyncState;

  lastSyncedAt?: string;

  compact?: boolean;

  showLabel?: boolean;
}

/* =====================================================
   CONFIG
===================================================== */

const statusConfig = {
  connected: {
    label: "Connected",

    icon: CheckCircle2,

    bg: "bg-emerald-100",

    text: "text-emerald-700",

    border: "border-emerald-200",
  },

  syncing: {
    label: "Syncing",

    icon: RefreshCw,

    bg: "bg-blue-100",

    text: "text-blue-700",

    border: "border-blue-200",

    spin: true,
  },

  delayed: {
    label: "Delayed",

    icon: AlertTriangle,

    bg: "bg-amber-100",

    text: "text-amber-700",

    border: "border-amber-200",
  },

  disconnected: {
    label: "Disconnected",

    icon: WifiOff,

    bg: "bg-red-100",

    text: "text-red-700",

    border: "border-red-200",
  },
} as const;

/* =====================================================
   COMPONENT
===================================================== */

export default function SyncStatus({
  status,
  lastSyncedAt,
  compact = false,
  showLabel = true,
}: SyncStatusProps) {
  const config =
    statusConfig[status];

  const Icon = config.icon;

  return (
    <div
      className={`
        inline-flex items-center gap-2

        rounded-full

        border

        ${config.border}

        bg-white

        ${
          compact
            ? "px-2.5 py-1"
            : "px-3 py-1.5"
        }

        shadow-sm
      `}
    >
      {/* Icon */}
      <div
        className={`
          flex items-center justify-center

          rounded-full

          ${config.bg}

          ${
            compact
              ? "h-5 w-5"
              : "h-6 w-6"
          }
        `}
      >
        <Icon
          className={`
            ${config.text}

            ${
              compact
                ? "h-3 w-3"
                : "h-3.5 w-3.5"
            }

           ${
  "spin" in config && config.spin
    ? "animate-spin"
    : ""
}
          `}
        />
      </div>

      {/* Label */}
      {showLabel && (
        <span
          className={`
            font-medium

            ${config.text}

            ${
              compact
                ? "text-xs"
                : "text-sm"
            }
          `}
        >
          {config.label}
        </span>
      )}

      {/* Last Sync */}
      {lastSyncedAt && (
        <span
          className="
            text-xs
            text-slate-500
          "
        >
          {lastSyncedAt}
        </span>
      )}
    </div>
  );
}