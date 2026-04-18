"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import MetricCard from "../../../components/dashboard/metric-card";

/* ================= TYPES ================= */

type AlertSeverity = "critical" | "watch" | "opportunity";
type AlertStatus = "new" | "in_progress" | "snoozed" | "resolved";

type Lead = {
  _id: string;
  name: string;
  company: string;
  value?: number;
  status?: string;
  lastContactedAt?: string | null;
};

type Deal = {
  _id: string;
  title: string;
  company: string;
  amount?: number;
  stage?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RevenueAlert = {
  id: string;
  title: string;
  message: string;
  company: string;
  severity: AlertSeverity;
  status: AlertStatus;
  impact: number;
  impactLabel: string;
  owner: string;
  detectedAt: string;
  action: string;
  detail: string;
};

/* ================= HELPERS ================= */

function formatCurrency(value: number) {
  return `$${(value / 1000).toFixed(0)}K`;
}

function getSeverityStyle(severity: AlertSeverity) {
  switch (severity) {
    case "critical":
      return "bg-red-50 text-red-700";
    case "watch":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-emerald-50 text-emerald-700";
  }
}

function getSeverityLabel(severity: AlertSeverity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/* ================= ALERT ENGINE ================= */

function generateAlerts({
  leads,
  deals,
}: {
  leads: Lead[];
  deals: Deal[];
}): RevenueAlert[] {
  const alerts: RevenueAlert[] = [];
  const now = new Date();

  // 🔴 Leads logic
  leads.forEach((lead) => {
    const value = lead.value || 0;

    // High value opportunity
    if (value > 50000) {
      alerts.push({
        id: `opportunity-${lead._id}`,
        title: "High value lead",
        message: `${lead.name} is high value`,
        company: lead.company,
        severity: "opportunity",
        status: "new",
        impact: value,
        impactLabel: formatCurrency(value),
        owner: "Sales",
        detectedAt: now.toISOString(),
        action: "Prioritize immediately",
        detail: "This lead has strong revenue potential.",
      });
    }

    // Follow-up logic (even if missing date)
    if (!lead.lastContactedAt) {
      alerts.push({
        id: `followup-${lead._id}`,
        title: "No contact yet",
        message: `${lead.name} not contacted`,
        company: lead.company,
        severity: "watch",
        status: "new",
        impact: value,
        impactLabel: formatCurrency(value),
        owner: "Sales",
        detectedAt: now.toISOString(),
        action: "Make first contact",
        detail: "This lead has not been contacted yet.",
      });
      return;
    }

    const diffDays =
      (now.getTime() - new Date(lead.lastContactedAt).getTime()) /
      (1000 * 60 * 60 * 24);

    if (diffDays > 5) {
      alerts.push({
        id: `stale-${lead._id}`,
        title: "Follow-up required",
        message: `${lead.name} is going cold`,
        company: lead.company,
        severity: "watch",
        status: "new",
        impact: value,
        impactLabel: formatCurrency(value),
        owner: "Sales",
        detectedAt: now.toISOString(),
        action: "Re-engage lead",
        detail: "Lead hasn’t been contacted recently.",
      });
    }
  });

  // 🔴 Deals logic
  deals.forEach((deal) => {
    const updated = new Date(deal.updatedAt || deal.createdAt || now);
    const diffDays =
      (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > 5 && deal.stage !== "closed") {
      alerts.push({
        id: `deal-${deal._id}`,
        title: "Deal stuck",
        message: `${deal.title} not moving`,
        company: deal.company,
        severity: "critical",
        status: "new",
        impact: deal.amount || 0,
        impactLabel: formatCurrency(deal.amount || 0),
        owner: "Sales",
        detectedAt: now.toISOString(),
        action: "Follow up urgently",
        detail: "Deal has not progressed recently.",
      });
    }
  });

  // 🔥 Remove duplicates
  return Array.from(new Map(alerts.map((a) => [a.id, a])).values());
}

/* ================= PAGE ================= */

export default function AlertsPage() {
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [alerts, setAlerts] = useState<RevenueAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] =
    useState<RevenueAlert | null>(null);

  /* 🔥 FETCH */
  useEffect(() => {
    async function fetchData() {
      try {
        const [l, d] = await Promise.all([
          fetch("/api/leads"),
          fetch("/api/deals"),
        ]);

        const leadsData = await l.json();
        const dealsData = await d.json();

        setLeads(leadsData?.data || []);
        setDeals(dealsData?.data || []);
      } catch (e) {
        console.error(e);
        setLeads([]);
        setDeals([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  /* 🔥 GENERATE */
  useEffect(() => {
    if (!Array.isArray(leads) || !Array.isArray(deals)) return;

    const result = generateAlerts({ leads, deals });

    // Sort: critical → watch → opportunity
    const sorted = result.sort((a, b) => {
      const order = { critical: 0, watch: 1, opportunity: 2 };
      return order[a.severity] - order[b.severity];
    });

    setAlerts(sorted);
  }, [leads, deals]);

  /* ================= METRICS ================= */

  const metrics = useMemo(() => {
    return {
      criticalCount: alerts.filter(
        (a) => a.severity === "critical" && a.status !== "resolved"
      ).length,
      watchCount: alerts.filter(
        (a) => a.severity === "watch" && a.status !== "resolved"
      ).length,
      revenueRisk: alerts
        .filter((a) => a.severity !== "opportunity")
        .reduce((sum, a) => sum + a.impact, 0),
    };
  }, [alerts]);

  function resolve(id: string) {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: "resolved" } : a
      )
    );
  }

  /* ================= UI ================= */

  return (
    <>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-10">

        {/* HEADER */}
        <header className="space-y-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>

          <div>
            <h1 className="text-3xl font-semibold">Alerts</h1>
            <p className="text-sm text-slate-500">
              AI-generated signals from your pipeline
            </p>
          </div>
        </header>

        {/* METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard title="Critical" value={String(metrics.criticalCount)} />
          <MetricCard title="Watch" value={String(metrics.watchCount)} />
          <MetricCard
            title="Revenue Risk"
            value={`$${(metrics.revenueRisk / 1000000).toFixed(1)}M`}
          />
        </div>

        {/* LIST */}
        <div className="space-y-4">

          {loading ? (
            <div className="text-center py-20">Loading...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-20 border rounded-xl bg-white">
              No alerts yet 🚀
            </div>
          ) : (
            alerts.map((alert, i) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="border rounded-xl p-5 bg-white hover:shadow-md"
              >
                <div className="flex justify-between">

                  <div>
                    <p className="font-semibold">{alert.title}</p>
                    <p className="text-sm text-slate-500">
                      {alert.company}
                    </p>

                    <span
                      className={`text-xs px-2 py-1 rounded ${getSeverityStyle(
                        alert.severity
                      )}`}
                    >
                      {getSeverityLabel(alert.severity)}
                    </span>

                    <p className="text-sm mt-1">{alert.message}</p>
                  </div>

                  <p className="font-semibold">{alert.impactLabel}</p>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setSelectedAlert(alert)}
                    className="text-sm border px-3 py-1 rounded"
                  >
                    View
                  </button>

                  {alert.status !== "resolved" && (
                    <button
                      onClick={() => resolve(alert.id)}
                      className="text-sm bg-black text-white px-3 py-1 rounded"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {selectedAlert && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/30"
              onClick={() => setSelectedAlert(null)}
            />
            <motion.div className="fixed inset-0 flex justify-center items-center">
              <div className="bg-white p-6 rounded-xl w-full max-w-md relative">

                <button
                  onClick={() => setSelectedAlert(null)}
                  className="absolute top-3 right-3"
                >
                  <X size={18} />
                </button>

                <h2 className="font-semibold text-lg">
                  {selectedAlert.title}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedAlert.company}
                </p>

                <p className="mt-4">{selectedAlert.detail}</p>

                <p className="text-xs mt-4 text-slate-400">
                  Suggested action:
                </p>
                <p>{selectedAlert.action}</p>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}