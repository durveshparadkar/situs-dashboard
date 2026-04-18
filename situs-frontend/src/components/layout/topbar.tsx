"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

import { generateAlerts, RevenueAlert } from "../../lib/alert-engine";

export default function Topbar() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const leads = [
    { _id: "1", name: "Rahul Sharma", company: "TechCorp", value: 120000, status: "new" as const, createdAt: "2026-03-25" },
  ];

  const deals = [
    { _id: "1", title: "Enterprise SaaS Deal", value: 150000, probability: 30, stage: "negotiation", updatedAt: "2026-03-20" },
  ];

  const [alerts, setAlerts] = useState<RevenueAlert[]>(() => generateAlerts(leads, deals));

  const unreadCount = alerts.filter((a) => a.status === "new").length;

  const markAsRead = (id: string) => {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: "resolved" } : a));
  };

  const clearAll = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, status: "resolved" })));
    toast.success("All alerts cleared");
  };

  const handleAlertClick = (alert: RevenueAlert) => {
    markAsRead(alert.id);
    if (alert.entityId && alert.entityType) {
      router.push(`/dashboard/${alert.entityType}s?highlight=${alert.entityId}`);
      setOpen(false);
    } else {
      toast("No linked item for this alert");
    }
  };

  return (
    <header style={{
      height: 64,
      width: "100%",
      borderBottom: "1px solid #e2e8f0",
      background: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      gap: 16,
      flexShrink: 0,
    }}>

      {/* LEFT */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#334155", whiteSpace: "nowrap" }}>
          Dashboard
        </div>

        {/* SEARCH */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, maxWidth: 400 }}>
          <Search size={16} style={{ position: "absolute", left: 12, color: "#94a3b8" }} />
          <input
            type="text"
            placeholder="Search deals, leads..."
            style={{
              width: "100%",
              paddingLeft: 36,
              paddingRight: 48,
              paddingTop: 8,
              paddingBottom: 8,
              fontSize: 13,
              background: "#f1f5f9",
              border: "none",
              borderRadius: 8,
              outline: "none",
            }}
          />
          <span style={{
            position: "absolute", right: 12, fontSize: 11, color: "#94a3b8",
            border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 6px",
          }}>
            ⌘K
          </span>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>

        {/* ADD DEAL */}
        <button style={{
          display: "flex", alignItems: "center", gap: 4, fontSize: 12,
          background: "black", color: "white", padding: "6px 12px",
          borderRadius: 8, border: "none", cursor: "pointer",
        }}>
          <Plus size={14} />
          Add Deal
        </button>

        {/* ALERTS */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setOpen((prev) => !prev)}
            style={{ position: "relative", padding: 8, borderRadius: 8, border: "none", background: "none", cursor: "pointer", color: "#64748b" }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                background: "#ef4444", color: "white", fontSize: 10,
                padding: "2px 5px", borderRadius: 999,
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                style={{
                  position: "absolute", right: 0, top: "100%", marginTop: 8,
                  width: 320, background: "white", border: "1px solid #e2e8f0",
                  borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", zIndex: 50, overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Alerts</span>
                  {unreadCount > 0 && (
                    <button onClick={clearAll} style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", cursor: "pointer" }}>
                      Clear all
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {alerts.length === 0 ? (
                    <p style={{ padding: "24px 16px", fontSize: 14, color: "#64748b", textAlign: "center" }}>No alerts</p>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        onClick={() => handleAlertClick(alert)}
                        style={{
                          padding: "12px 16px",
                          borderBottom: "1px solid #f1f5f9",
                          background: alert.status === "new" ? "#f8fafc" : "white",
                          cursor: "pointer",
                        }}
                      >
                        <p style={{ fontSize: 14, fontWeight: 500 }}>{alert.title}</p>
                        <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{alert.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* USER */}
        <div style={{
          height: 32, width: 32, borderRadius: "50%", background: "black", color: "white",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600,
        }}>
          D
        </div>

      </div>
    </header>
  );
}