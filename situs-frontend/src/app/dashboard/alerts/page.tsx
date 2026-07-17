"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell, Check, Clock, CheckCircle2 } from "lucide-react";
import MetricCard from "../../../components/dashboard/metric-card";
import toast from "react-hot-toast";

import { apiFetch } from "@/lib/api";
import { formatCurrency, useOrgCurrency } from "@/lib/currency";

/* ================= TYPES ================= */

type AlertSeverity = "critical" | "watch" | "opportunity";
type AlertStatus = "new" | "acknowledged" | "snoozed" | "resolved";

type RevenueAlert = {
  id: string;
  title: string;
  message: string;
  company: string;
  severity: AlertSeverity;
  status: AlertStatus;
  impact: number;
  detectedAt: string;
  action: string;
  detail: string;
  riskScore?: number;
  snoozedUntil?: string;
  aiReason?: string;
};

type Notification = {
  _id: string;
  title: string;
  read: boolean;
  createdAt: string;
};

/* Backend alert shape (subset we read) */
type BackendAlert = {
  _id: string;
  title: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  impactScore?: number;
  createdAt: string;
  recommendedAction?: string;
  relatedTo?: { label?: string };
};

/* ================= MAPPERS ================= */

function mapSeverity(s: BackendAlert["severity"]): AlertSeverity {
  if (s === "critical") return "critical";
  if (s === "high" || s === "medium") return "watch";
  return "opportunity";
}

function mapStatus(s: BackendAlert["status"]): AlertStatus {
  if (s === "open") return "new";
  if (s === "acknowledged") return "acknowledged";
  if (s === "resolved" || s === "dismissed") return "resolved";
  return "new";
}

function generateReason(severity: AlertSeverity): string {
  if (severity === "critical") return "High impact + urgent attention required";
  if (severity === "watch") return "Moderate risk trend detected";
  return "Potential opportunity detected";
}

function mapBackendAlert(a: BackendAlert): RevenueAlert {
  const severity = mapSeverity(a.severity);
  return {
    id: a._id,
    title: a.title,
    message: a.message,
    company: a.relatedTo?.label || "—",
    severity,
    status: mapStatus(a.status),
    impact: typeof a.impactScore === "number" ? a.impactScore : 0,
    detectedAt: a.createdAt,
    action: a.recommendedAction || "",
    detail: a.message,
    riskScore: typeof a.impactScore === "number" ? a.impactScore : 0,
    aiReason: generateReason(severity),
  };
}

/* ================= HELPERS ================= */

/* Severity styling — kept as a distinct, high-contrast badge (Von
   Restorff Effect) so critical items are unmistakable even when
   scanning quickly, not just reading carefully. */
function getSeverityStyle(severity: AlertSeverity) {
  switch (severity) {
    case "critical":
      return "bg-red-50 text-red-700 border-red-200";
    case "watch":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

function getSeverityDot(severity: AlertSeverity) {
  switch (severity) {
    case "critical":
      return "bg-red-500";
    case "watch":
      return "bg-amber-500";
    default:
      return "bg-emerald-500";
  }
}

function getSeverityRing(severity: AlertSeverity) {
  switch (severity) {
    case "critical":
      return "ring-red-100";
    case "watch":
      return "ring-amber-100";
    default:
      return "ring-emerald-100";
  }
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* Same Card primitive language as Settings: rounded-2xl, subtle
   hover lift (Aesthetic-Usability Effect) — the whole app should
   feel like one coherent product, not several bolted together. */
const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: "easeOut" }}
    className={`rounded-2xl border border-zinc-100 bg-white transition-all duration-200 hover:border-zinc-200 hover:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] ${className}`}
  >
    {children}
  </motion.div>
);

/* ================= PAGE ================= */

export default function AlertsPage() {
  const router = useRouter();
  const currency = useOrgCurrency();

  const [alerts, setAlerts] = useState<RevenueAlert[]>([]);
  const [notifications] = useState<Notification[]>([]);
  const [showPanel, setShowPanel] = useState(false);

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const [now, setNow] = useState<number>(() => Date.now());

  /* Tracks which alert just got an action, purely for the brief
     confirmation flash (Peak-End Rule) — the row visibly acknowledges
     the click before settling into its new state. */
  const [justActioned, setJustActioned] = useState<{ id: string; kind: "ack" | "resolve" | "snooze" } | null>(null);

  /* ================= CLOCK ================= */

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  /* ================= FETCH (REST polling) ================= */

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: BackendAlert[] }>(
        "/api/alerts?limit=100&sortOrder=desc"
      );
      const raw = Array.isArray(res?.data) ? res.data : [];
      setAlerts(raw.map(mapBackendAlert));
      setConnected(true);
    } catch (err) {
      console.error("Failed to fetch alerts", err);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    /* Poll every 20s — replaces the old WebSocket stream */
    const interval = setInterval(fetchAlerts, 20_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  /* ================= ACTIONS ================= */

  const updateStatusLocal = (alert: RevenueAlert, status: AlertStatus) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, status } : a))
    );
  };

  const flashAction = (id: string, kind: "ack" | "resolve" | "snooze") => {
    setJustActioned({ id, kind });
    setTimeout(() => setJustActioned((cur) => (cur?.id === id ? null : cur)), 900);
  };

  const handleAck = async (a: RevenueAlert) => {
    flashAction(a.id, "ack");
    updateStatusLocal(a, "acknowledged");
    toast.success("Acknowledged");
    try {
      await apiFetch(`/api/alerts/${a.id}/read`, { method: "PATCH" });
    } catch {
      toast.error("Failed to sync");
    }
  };

  const handleResolve = async (a: RevenueAlert) => {
    flashAction(a.id, "resolve");
    updateStatusLocal(a, "resolved");
    toast.success("Resolved");
    try {
      await apiFetch(`/api/alerts/${a.id}/resolve`, { method: "PATCH" });
    } catch {
      toast.error("Failed to sync");
    }
  };

  const handleSnooze = (a: RevenueAlert) => {
    flashAction(a.id, "snooze");
    /* Snooze is client-side only — backend has no snooze concept */
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    setAlerts((prev) =>
      prev.map((al) =>
        al.id === a.id
          ? { ...al, status: "snoozed", snoozedUntil: until }
          : al
      )
    );

    toast("Snoozed 30 min");
  };

  /* ================= FILTER ================= */

  const visibleAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (a.status === "resolved") return false;

      if (a.status === "snoozed") {
        if (!a.snoozedUntil) return false;
        return new Date(a.snoozedUntil).getTime() <= now;
      }

      return true;
    });
  }, [alerts, now]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-16 bg-zinc-100 rounded-lg" />
          <div className="h-8 w-56 bg-zinc-100 rounded-lg" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-zinc-50 rounded-2xl animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 bg-zinc-50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

      {/* HEADER — same type scale as Settings (28px title, 14px
          subtext) so the whole app reads as one voice, not several
          different products stitched together. */}
      <div className="flex justify-between items-center">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors mb-2 group"
          >
            <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" /> Back
          </button>

          <h1 className="text-[28px] font-semibold text-zinc-900 tracking-tight">
            Alerts Intelligence
          </h1>

          <p className="text-[13px] mt-1.5 flex items-center gap-1.5">
            {connected ? (
              <span className="text-emerald-600 flex items-center gap-1.5 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            ) : (
              <span className="text-red-500 flex items-center gap-1.5 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Reconnecting...
              </span>
            )}
          </p>
        </div>

        {/* NOTIFICATIONS */}
        <div className="relative">
          <button
            onClick={() => setShowPanel((p) => !p)}
            className="relative p-2.5 rounded-xl hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 active:scale-95 transition-all"
          >
            <Bell size={18} />

            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-medium px-1.5 rounded-full min-w-[16px] text-center">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showPanel && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-72 bg-white border border-zinc-100 rounded-2xl shadow-lg p-3 z-50"
              >
                {notifications.length === 0 ? (
                  <div className="p-3 text-[13px] text-zinc-400 text-center">
                    No notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n._id}
                      className="p-2.5 text-[13px] text-zinc-700 hover:bg-zinc-50 rounded-xl transition-colors"
                    >
                      {n.title}
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* METRICS */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="p-5">
          <MetricCard
            title="Critical"
            value={String(
              visibleAlerts.filter((a) => a.severity === "critical").length
            )}
          />
        </Card>
        <Card className="p-5">
          <MetricCard
            title="Watch"
            value={String(
              visibleAlerts.filter((a) => a.severity === "watch").length
            )}
          />
        </Card>
        <Card className="p-5">
          <MetricCard
            title="Revenue Risk"
            value={formatCurrency(
              visibleAlerts.reduce((s, a) => s + a.impact, 0),
              currency
            )}
          />
        </Card>
      </div>

      {/* LIST */}
      <Card className="p-0 overflow-hidden">
        {visibleAlerts.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} className="text-emerald-500" />
            </div>
            <p className="text-zinc-900 text-[14px] font-medium">No active alerts</p>
            <p className="text-zinc-400 text-[13px] mt-1">
              You&apos;ll see critical and watch signals here as they&apos;re detected
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {visibleAlerts.map((alert) => {
              const isFlashing = justActioned?.id === alert.id;
              return (
                <motion.div
                  key={alert.id}
                  animate={
                    isFlashing
                      ? { backgroundColor: ["rgba(16,185,129,0.06)", "rgba(255,255,255,0)"] }
                      : {}
                  }
                  transition={{ duration: 0.9 }}
                  className="p-5 flex justify-between gap-4 hover:bg-zinc-50/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ring-4 ${getSeverityDot(
                          alert.severity
                        )} ${getSeverityRing(alert.severity)}`}
                      />
                      <p className="font-medium text-zinc-900 text-[14.5px]">{alert.title}</p>
                    </div>

                    <span
                      className={`inline-block mt-2.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${getSeverityStyle(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>

                    <p className="text-[13.5px] text-zinc-600 mt-2.5 leading-relaxed">{alert.message}</p>

                    <div className="flex items-center gap-3 mt-2.5">
                      <p className="text-[12px] text-zinc-400">
                        AI Score: <span className="font-medium text-zinc-500">{alert.riskScore}</span>
                      </p>
                      {alert.aiReason && (
                        <>
                          <span className="h-1 w-1 rounded-full bg-zinc-300" />
                          <p className="text-[12px] text-zinc-400">
                            {alert.aiReason}
                          </p>
                        </>
                      )}
                      <span className="h-1 w-1 rounded-full bg-zinc-300" />
                      <p className="text-[12px] text-zinc-400 flex items-center gap-1">
                        <Clock size={11} />
                        {timeAgo(alert.detectedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <p className="font-semibold text-zinc-900 tabular-nums text-[14.5px]">
                      {formatCurrency(alert.impact, currency)}
                    </p>

                    <div className="flex gap-2 text-[12.5px]">
                      <button
                        onClick={() => handleAck(alert)}
                        className="flex items-center gap-1 border border-zinc-200 px-3 py-1.5 rounded-xl font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 active:scale-95 transition-all"
                      >
                        {isFlashing && justActioned?.kind === "ack" ? (
                          <Check size={12} className="text-emerald-500" />
                        ) : null}
                        Ack
                      </button>
                      <button
                        onClick={() => handleSnooze(alert)}
                        className="border border-zinc-200 px-3 py-1.5 rounded-xl font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 active:scale-95 transition-all"
                      >
                        Snooze
                      </button>
                      <button
                        onClick={() => handleResolve(alert)}
                        className="bg-zinc-900 text-white px-3 py-1.5 rounded-xl font-medium hover:bg-zinc-700 active:scale-95 transition-all"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}