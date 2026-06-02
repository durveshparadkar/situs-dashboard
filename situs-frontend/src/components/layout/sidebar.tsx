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
  GitBranch,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ================= NAV ================= */

const sections = [
  {
    title: "Overview",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Revenue",
    items: [
      { name: "Deals", href: "/dashboard/deals", icon: Briefcase },
      { name: "Pipeline", href: "/dashboard/pipeline", icon: GitBranch }, // ✅ FIXED
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

  return (
    <aside
      className={`
        h-screen border-r bg-white flex flex-col
        transition-all duration-300 ease-out
        ${collapsed ? "w-[72px]" : "w-[240px]"}
      `}
    >

      {/* HEADER */}
      <div className="h-14 flex items-center justify-between px-3 border-b">
        {!collapsed && (
          <div>
            <p className="text-sm font-semibold text-slate-900">Situs</p>
            <p className="text-[11px] text-slate-400">Revenue OS</p>
          </div>
        )}

        <button
          onClick={() => setCollapsed((p) => !p)}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* NAV */}
      <nav className="flex-1 overflow-y-auto py-5 px-2 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>

            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {section.title}
              </p>
            )}

            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;

                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center rounded-lg text-sm transition-all
                      ${collapsed ? "justify-center py-2.5" : "px-3 py-2.5 gap-3"}
                      
                      ${
                        active
                          ? "bg-slate-100 text-slate-900 font-medium"
                          : "text-slate-600 hover:bg-slate-50"
                      }
                    `}
                  >
                    <Icon
                      size={18}
                      className={`
                        transition
                        ${
                          active
                            ? "text-slate-900"
                            : "text-slate-500 group-hover:text-slate-700"
                        }
                      `}
                    />

                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* USER */}
      <div className="border-t p-3">
        <div
          className={`flex items-center ${
            collapsed ? "justify-center" : "gap-3"
          }`}
        >
          <div className="h-9 w-9 rounded-full bg-black text-white flex items-center justify-center text-xs font-semibold">
            D
          </div>

          {!collapsed && (
            <div className="text-xs leading-tight">
              <p className="font-medium text-slate-900">Durvesh</p>
              <p className="text-slate-500">Founder</p>
            </div>
          )}
        </div>
      </div>

    </aside>
  );
}