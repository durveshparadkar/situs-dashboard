"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  AlertTriangle,
  BarChart3,
  Settings,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const sections = [
  {
    title: "Overview",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Revenue",
    items: [
      { name: "Deals", href: "/dashboard/deals", icon: Briefcase },
      { name: "Pipeline", href: "/dashboard/pipeline", icon: Briefcase },
      { name: "Leads", href: "/dashboard/leads", icon: Users },
      { name: "Alerts", href: "/dashboard/alerts", icon: AlertTriangle },
    ],
  },
  {
    title: "Insights",
    items: [
      { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { name: "Forecast", href: "/dashboard/forecast", icon: TrendingUp },
    ],
  },
  {
    title: "System",
    items: [{ name: "Settings", href: "/dashboard/settings", icon: Settings }],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const width = collapsed ? 80 : 260;

  return (
    <aside
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        height: "100vh",
        background: "white",
        borderRight: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.3s ease",
      }}
    >
      {/* HEADER */}
      <div style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: "0 16px",
        borderBottom: "1px solid #e2e8f0",
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div style={{ lineHeight: 1.3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", display: "block" }}>Situs</span>
            <span style={{ fontSize: 12, color: "#64748b" }}>Revenue OS</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{ padding: 4, borderRadius: 6, border: "none", background: "none", cursor: "pointer", color: "#64748b" }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* NAV */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 24, padding: "24px 8px", flex: 1, overflowY: "auto" }}>
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p style={{ padding: "0 12px", marginBottom: 8, fontSize: 10, textTransform: "uppercase", color: "#94a3b8", fontWeight: 600, letterSpacing: "0.05em" }}>
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: collapsed ? 0 : 12,
                    justifyContent: collapsed ? "center" : "flex-start",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    textDecoration: "none",
                    background: active ? "#f1f5f9" : "transparent",
                    color: active ? "#0f172a" : "#475569",
                    transition: "background 0.15s",
                  }}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* USER */}
      <div style={{ borderTop: "1px solid #e2e8f0", padding: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 12, justifyContent: collapsed ? "center" : "flex-start" }}>
          <div style={{
            height: 36, width: 36, borderRadius: "50%", background: "black", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}>
            D
          </div>
          {!collapsed && (
            <div style={{ fontSize: 12 }}>
              <p style={{ fontWeight: 500, color: "#0f172a" }}>Durvesh</p>
              <p style={{ color: "#64748b" }}>Founder</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}