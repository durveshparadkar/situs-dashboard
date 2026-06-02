"use client";

import {
  Smile,
  Meh,
  Frown,
} from "lucide-react";

/* =====================================================
   TYPES
===================================================== */

export type Sentiment =
  | "positive"
  | "neutral"
  | "negative";

interface SentimentIndicatorProps {
  sentiment: Sentiment;

  score?: number;

  compact?: boolean;

  showLabel?: boolean;
}

/* =====================================================
   CONFIG
===================================================== */

const sentimentConfig = {
  positive: {
    label: "Positive",

    icon: Smile,

    bg: "bg-emerald-100",

    text: "text-emerald-700",

    border: "border-emerald-200",
  },

  neutral: {
    label: "Neutral",

    icon: Meh,

    bg: "bg-slate-100",

    text: "text-slate-700",

    border: "border-slate-200",
  },

  negative: {
    label: "Negative",

    icon: Frown,

    bg: "bg-red-100",

    text: "text-red-700",

    border: "border-red-200",
  },
} as const;

/* =====================================================
   COMPONENT
===================================================== */

export default function SentimentIndicator({
  sentiment,
  score,
  compact = false,
  showLabel = true,
}: SentimentIndicatorProps) {
  const config =
    sentimentConfig[sentiment];

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

      {/* Score */}
      {typeof score === "number" && (
        <span
          className="
            text-xs
            font-medium
            text-slate-500
          "
        >
          {score}%
        </span>
      )}
    </div>
  );
}