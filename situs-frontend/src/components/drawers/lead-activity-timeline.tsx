"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  Phone,
  Calendar,
  StickyNote,
  ArrowRightLeft,
  UserPlus,
  Sparkles,
  CheckCircle2,
  XCircle,
  Tag,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

/* ================= TYPES ================= */

type ActivityAction =
  | "CREATED" | "UPDATED" | "STAGE_CHANGED" | "STATUS_CHANGED" | "ARCHIVED"
  | "RESTORED" | "DELETED" | "ASSIGNED" | "UNASSIGNED" | "REASSIGNED"
  | "OWNER_CHANGED" | "EMAIL_SENT" | "EMAIL_OPENED" | "EMAIL_REPLIED"
  | "CALL_LOGGED" | "MEETING_SCHEDULED" | "MEETING_COMPLETED" | "NOTE_ADDED"
  | "TASK_CREATED" | "TASK_COMPLETED" | "QUALIFIED" | "DISQUALIFIED"
  | "SCORE_CHANGED" | "TAG_ADDED" | "TAG_REMOVED" | "CONVERTED_TO_DEAL"
  | "MERGED" | "ESCALATION_REQUESTED" | "ESCALATION_APPROVED"
  | "ESCALATION_REJECTED" | "SYNCED_FROM_HUBSPOT" | "SYNCED_FROM_SALESFORCE"
  | "IMPORTED" | "EXPORTED" | "AI_ENRICHED" | "AI_SCORED"
  | "AI_RECOMMENDATION_GENERATED";

interface LeadActivityItem {
  _id: string;
  action: ActivityAction;
  actorType: "user" | "system" | "ai" | "integration" | "api";
  actorName?: string;
  description?: string;
  createdAt: string;
}

interface ActivitiesResponse {
  success: boolean;
  data?: LeadActivityItem[];
}

/* ================= ICON + LABEL MAP ================= */

const ACTION_META: Record<
  ActivityAction,
  { icon: typeof Mail; label: string; color: string }
> = {
  CREATED: { icon: UserPlus, label: "Lead created", color: "text-slate-500" },
  UPDATED: { icon: StickyNote, label: "Details updated", color: "text-slate-500" },
  STAGE_CHANGED: { icon: ArrowRightLeft, label: "Stage changed", color: "text-blue-500" },
  STATUS_CHANGED: { icon: ArrowRightLeft, label: "Status changed", color: "text-blue-500" },
  ARCHIVED: { icon: XCircle, label: "Archived", color: "text-slate-400" },
  RESTORED: { icon: CheckCircle2, label: "Restored", color: "text-emerald-500" },
  DELETED: { icon: XCircle, label: "Deleted", color: "text-red-500" },
  ASSIGNED: { icon: UserPlus, label: "Assigned", color: "text-slate-500" },
  UNASSIGNED: { icon: UserPlus, label: "Unassigned", color: "text-slate-400" },
  REASSIGNED: { icon: UserPlus, label: "Reassigned", color: "text-slate-500" },
  OWNER_CHANGED: { icon: UserPlus, label: "Owner changed", color: "text-slate-500" },
  EMAIL_SENT: { icon: Mail, label: "Email sent", color: "text-red-500" },
  EMAIL_OPENED: { icon: Mail, label: "Email opened", color: "text-amber-500" },
  EMAIL_REPLIED: { icon: Mail, label: "Email replied", color: "text-emerald-500" },
  CALL_LOGGED: { icon: Phone, label: "Call logged", color: "text-blue-500" },
  MEETING_SCHEDULED: { icon: Calendar, label: "Meeting scheduled", color: "text-blue-500" },
  MEETING_COMPLETED: { icon: Calendar, label: "Meeting completed", color: "text-blue-600" },
  NOTE_ADDED: { icon: StickyNote, label: "Note added", color: "text-slate-500" },
  TASK_CREATED: { icon: CheckCircle2, label: "Task created", color: "text-slate-500" },
  TASK_COMPLETED: { icon: CheckCircle2, label: "Task completed", color: "text-emerald-500" },
  QUALIFIED: { icon: CheckCircle2, label: "Qualified", color: "text-emerald-500" },
  DISQUALIFIED: { icon: XCircle, label: "Disqualified", color: "text-red-500" },
  SCORE_CHANGED: { icon: Sparkles, label: "Score updated", color: "text-purple-500" },
  TAG_ADDED: { icon: Tag, label: "Tag added", color: "text-slate-500" },
  TAG_REMOVED: { icon: Tag, label: "Tag removed", color: "text-slate-400" },
  CONVERTED_TO_DEAL: { icon: ArrowRightLeft, label: "Converted to deal", color: "text-emerald-600" },
  MERGED: { icon: ArrowRightLeft, label: "Merged", color: "text-slate-500" },
  ESCALATION_REQUESTED: { icon: Sparkles, label: "Escalation requested", color: "text-amber-500" },
  ESCALATION_APPROVED: { icon: CheckCircle2, label: "Escalation approved", color: "text-emerald-500" },
  ESCALATION_REJECTED: { icon: XCircle, label: "Escalation rejected", color: "text-red-500" },
  SYNCED_FROM_HUBSPOT: { icon: ArrowRightLeft, label: "Synced from HubSpot", color: "text-orange-500" },
  SYNCED_FROM_SALESFORCE: { icon: ArrowRightLeft, label: "Synced from Salesforce", color: "text-blue-500" },
  IMPORTED: { icon: ArrowRightLeft, label: "Imported", color: "text-slate-500" },
  EXPORTED: { icon: ArrowRightLeft, label: "Exported", color: "text-slate-500" },
  AI_ENRICHED: { icon: Sparkles, label: "AI enriched", color: "text-purple-500" },
  AI_SCORED: { icon: Sparkles, label: "AI scored", color: "text-purple-500" },
  AI_RECOMMENDATION_GENERATED: { icon: Sparkles, label: "AI recommendation", color: "text-purple-500" },
};

const ACTOR_LABEL: Record<LeadActivityItem["actorType"], string> = {
  user: "",
  system: "System",
  ai: "AI",
  integration: "",
  api: "API",
};

/* ================= HELPERS ================= */

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ================= COMPONENT ================= */

export default function LeadActivityTimeline({ leadId }: { leadId: string }) {
  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(false);
        const res = await apiFetch<ActivitiesResponse>(
          `/api/leads/${leadId}/actions/activities?limit=30`
        );
        if (!cancelled) setActivities(res?.data ?? []);
      } catch (err) {
        console.error("Failed to load lead activity", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (leadId) load();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 size={16} className="animate-spin mr-2" />
        <span className="text-xs">Loading activity…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-slate-400 py-4 text-center">
        Couldn&apos;t load activity history.
      </p>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-xs text-slate-400 py-4 text-center">
        No activity yet.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {activities.map((item, i) => {
        const meta = ACTION_META[item.action] ?? {
          icon: StickyNote,
          label: item.action,
          color: "text-slate-500",
        };
        const Icon = meta.icon;
        const isLast = i === activities.length - 1;

        /* Prefer integration actor names (Gmail, Zoom, Slack) since
           those are more informative than the generic actorType label */
        const sourceLabel =
          item.actorType === "integration" && item.actorName
            ? item.actorName
            : ACTOR_LABEL[item.actorType];

        return (
          <div key={item._id} className="flex gap-3">
            {/* Icon + connecting line */}
            <div className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full bg-slate-50 border border-slate-200 shrink-0 ${meta.color}`}
              >
                <Icon size={12} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-slate-100 my-1" />}
            </div>

            {/* Content */}
            <div className={`pb-4 min-w-0 ${isLast ? "" : ""}`}>
              <p className="text-[13px] text-slate-900 leading-tight">
                {item.description || meta.label}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {timeAgo(item.createdAt)}
                {sourceLabel && <> · {sourceLabel}</>}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}