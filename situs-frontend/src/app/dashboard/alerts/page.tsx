"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell } from "lucide-react";
import MetricCard from "../../../components/dashboard/metric-card";
import toast from "react-hot-toast";

import { apiFetch } from "@/lib/api";

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

/* Indian currency formatter — Cr / L / plain rupees.
   Matches the dashboard so the whole app reads consistently. */
function formatINR(rupees: number): string {
  const v = rupees || 0;
  if (v >= 10_000_000) return "₹" + (v / 10_000_000).toFixed(1) + "Cr";
  if (v >= 100_000) return "₹" + (v / 100_000).toFixed(1) + "L";
  return "₹" + v.toLocaleString("en-IN");
}

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

/* ================= PAGE ================= */

export default function AlertsPage() {
  const router = useRouter();

  const [alerts, setAlerts] = useState<RevenueAlert[]>([]);
  const [notifications] = useState<Notification[]>([]);
  const [showPanel, setShowPanel] = useState(false);

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const [now, setNow] = useState<number>(() => Date.now());

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

  const handleAck = async (a: RevenueAlert) => {
    updateStatusLocal(a, "acknowledged");
    toast.success("Acknowledged");
    try {
      await apiFetch(`/api/alerts/${a.id}/read`, { method: "PATCH" });
    } catch {
      toast.error("Failed to sync");
    }
  };

  const handleResolve = async (a: RevenueAlert) => {
    updateStatusLocal(a, "resolved");
    toast.success("Resolved");
    try {
      await apiFetch(`/api/alerts/${a.id}/resolve`, { method: "PATCH" });
    } catch {
      toast.error("Failed to sync");
    }
  };

  const handleSnooze = (a: RevenueAlert) => {
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

  /* ================= UI ================= */

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <button
            onClick={() => router.back()}
            className="flex gap-2 text-sm text-slate-500"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <h1 className="text-3xl font-semibold">Alerts Intelligence</h1>

          <p className="text-xs mt-1">
            {connected ? (
              <span className="text-emerald-600">● Live</span>
            ) : (
              <span className="text-red-500">● Reconnecting...</span>
            )}
          </p>
        </div>

        {/* NOTIFICATIONS */}
        <div className="relative">
          <button onClick={() => setShowPanel((p) => !p)}>
            <Bell size={20} />

            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-1 rounded">
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
                className="absolute right-0 mt-3 w-72 bg-white border rounded-xl shadow-lg p-3 z-50"
              >
                {notifications.length === 0 ? (
                  <div className="p-2 text-sm text-slate-400">
                    No notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n._id} className="p-2 text-sm">
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
        <MetricCard
          title="Critical"
          value={String(
            visibleAlerts.filter((a) => a.severity === "critical").length
          )}
        />
        <MetricCard
          title="Watch"
          value={String(
            visibleAlerts.filter((a) => a.severity === "watch").length
          )}
        />
        <MetricCard
          title="Revenue Risk"
          value={formatINR(
            visibleAlerts.reduce((s, a) => s + a.impact, 0)
          )}
        />
      </div>

      {/* LIST */}
      <div className="border rounded-xl bg-white divide-y">
        {loading ? (
          <div className="p-10 text-center">Connecting...</div>
        ) : visibleAlerts.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No active alerts
          </div>
        ) : (
          visibleAlerts.map((alert) => (
            <div key={alert.id} className="p-4 flex justify-between">
              <div>
                <p className="font-medium">{alert.title}</p>

                <span
                  className={`text-xs px-2 py-0.5 rounded border ${getSeverityStyle(
                    alert.severity
                  )}`}
                >
                  {alert.severity}
                </span>

                <p className="text-sm">{alert.message}</p>

                <p className="text-xs text-slate-400">
                  AI Score: {alert.riskScore}
                </p>

                {alert.aiReason && (
                  <p className="text-xs text-slate-400">
                    {alert.aiReason}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <p>{formatINR(alert.impact)}</p>

                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => handleAck(alert)}
                    className="border px-2 py-1 rounded"
                  >
                    Ack
                  </button>
                  <button
                    onClick={() => handleSnooze(alert)}
                    className="border px-2 py-1 rounded"
                  >
                    Snooze
                  </button>
                  <button
                    onClick={() => handleResolve(alert)}
                    className="bg-black text-white px-2 py-1 rounded"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}