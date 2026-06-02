"use client";

import { motion } from "framer-motion";

import {
  AlertTriangle,
  Mail,
  MessageSquare,
  Calendar,
  TrendingUp,
} from "lucide-react";

/* =====================================================
   TYPES
===================================================== */

export interface ActivityTimelineItem {
  id: string;

  type:
    | "email"
    | "slack"
    | "meeting"
    | "risk"
    | "opportunity";

  title: string;

  description: string;

  timestamp: string;

  source?: string;
}

interface ActivityTimelineProps {
  activities: ActivityTimelineItem[];

  loading?: boolean;

  emptyMessage?: string;
}

/* =====================================================
   CONFIG
===================================================== */

const activityConfig = {
  email: {
    icon: Mail,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },

  slack: {
    icon: MessageSquare,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
  },

  meeting: {
    icon: Calendar,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },

  risk: {
    icon: AlertTriangle,
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
  },

  opportunity: {
    icon: TrendingUp,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
} as const;

/* =====================================================
   COMPONENT
===================================================== */

export default function ActivityTimeline({
  activities,
  loading = false,
  emptyMessage = "No intelligence activity available",
}: ActivityTimelineProps) {
  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="
              h-24

              animate-pulse

              rounded-2xl

              border border-slate-200

              bg-slate-100
            "
          />
        ))}
      </div>
    );
  }

  /* ================= EMPTY ================= */

  if (!activities.length) {
    return (
      <div
        className="
          rounded-2xl

          border border-dashed border-slate-200

          bg-white

          p-10

          text-center
        "
      >
        <p className="text-sm text-slate-500">
          {emptyMessage}
        </p>
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Intelligence Activity
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Real-time revenue intelligence signals
        </p>
      </div>

      <div className="relative">
        <div className="absolute left-5 top-0 h-full w-px bg-slate-200" />

        <div className="space-y-5">
          {activities.map((activity, index) => {
            const config =
              activityConfig[activity.type];

            const Icon = config.icon;

            return (
              <motion.div
                key={activity.id}
                initial={{
                  opacity: 0,
                  y: 8,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  delay: index * 0.03,
                }}
                className="
                  relative

                  flex gap-4

                  rounded-2xl

                  border border-slate-200

                  bg-white

                  p-4

                  shadow-sm

                  transition-all

                  hover:-translate-y-0.5
                  hover:shadow-md
                "
              >
                {/* Icon */}
                <div
                  className={`
                    relative z-10

                    flex h-10 w-10 shrink-0 items-center justify-center

                    rounded-full

                    ${config.iconBg}
                  `}
                >
                  <Icon
                    className={`
                      h-5 w-5
                      ${config.iconColor}
                    `}
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {activity.title}
                      </h3>

                      <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {activity.description}
                      </p>
                    </div>

                    <div className="shrink-0 text-xs text-slate-400">
                      {activity.timestamp}
                    </div>
                  </div>

                  {/* Source */}
                  {activity.source && (
                    <div className="mt-3">
                      <span
                        className="
                          inline-flex items-center

                          rounded-full

                          border border-slate-200

                          bg-slate-50

                          px-2.5 py-1

                          text-xs
                          font-medium

                          text-slate-600
                        "
                      >
                        {activity.source}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}