"use client";

import {
  Mail,
  MessageSquare,
  Calendar,
  Video,
  Database,
  Briefcase,
} from "lucide-react";

/* =====================================================
   TYPES
===================================================== */

export type IntegrationProvider =
  | "salesforce"
  | "hubspot"
  | "gmail"
  | "slack"
  | "zoom"
  | "calendar"
  | "teams"
  | "outlook"
  | "zoho"
  | "pipedrive"
  | "googleMeet";

interface IntegrationBadgeProps {
  provider: IntegrationProvider;

  connected?: boolean;

  compact?: boolean;
}

/* =====================================================
   CONFIG
===================================================== */

const providerConfig = {
  salesforce: {
    label: "Salesforce",
    icon: Database,
    bg: "bg-sky-100",
    text: "text-sky-700",
  },

  hubspot: {
    label: "HubSpot",
    icon: Briefcase,
    bg: "bg-orange-100",
    text: "text-orange-700",
  },

  gmail: {
    label: "Gmail",
    icon: Mail,
    bg: "bg-red-100",
    text: "text-red-700",
  },

  slack: {
    label: "Slack",
    icon: MessageSquare,
    bg: "bg-violet-100",
    text: "text-violet-700",
  },

  zoom: {
    label: "Zoom",
    icon: Video,
    bg: "bg-blue-100",
    text: "text-blue-700",
  },

  calendar: {
    label: "Calendar",
    icon: Calendar,
    bg: "bg-emerald-100",
    text: "text-emerald-700",
  },

  teams: {
    label: "Teams",
    icon: MessageSquare,
    bg: "bg-indigo-100",
    text: "text-indigo-700",
  },

  outlook: {
    label: "Outlook",
    icon: Mail,
    bg: "bg-cyan-100",
    text: "text-cyan-700",
  },

  zoho: {
    label: "Zoho",
    icon: Briefcase,
    bg: "bg-green-100",
    text: "text-green-700",
  },

  pipedrive: {
    label: "Pipedrive",
    icon: Database,
    bg: "bg-yellow-100",
    text: "text-yellow-700",
  },

  googleMeet: {
    label: "Google Meet",
    icon: Video,
    bg: "bg-lime-100",
    text: "text-lime-700",
  },
} as const;

/* =====================================================
   COMPONENT
===================================================== */

export default function IntegrationBadge({
  provider,
  connected = true,
  compact = false,
}: IntegrationBadgeProps) {
  const config =
    providerConfig[provider];

  const Icon = config.icon;

  return (
    <div
      className={`
        inline-flex items-center gap-2

        rounded-full

        border

        ${
          connected
            ? "border-slate-200 bg-white"
            : "border-slate-100 bg-slate-50 opacity-60"
        }

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
      <span
        className={`
          font-medium text-slate-700

          ${
            compact
              ? "text-xs"
              : "text-sm"
          }
        `}
      >
        {config.label}
      </span>

      {/* Status dot */}
      <div
        className={`
          rounded-full

          ${
            connected
              ? "bg-emerald-500"
              : "bg-slate-300"
          }

          ${
            compact
              ? "h-1.5 w-1.5"
              : "h-2 w-2"
          }
        `}
      />
    </div>
  );
}