"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { apiFetch } from "@/lib/api";

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

/* ================= USER PROFILE TYPE ================= */

type UserProfile = {
  fullName?: string;
  email: string;
  role?: string;
};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: UserProfile }>(
          "/api/auth/me"
        );
        if (res?.success && res?.data) {
          setUser(res.data);
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
      }
    };
    loadProfile();
  }, []);

  /* Derive display name + initial from real user data, falling back
     gracefully if fullName isn't set (e.g. legacy accounts) */
  const displayName = user?.fullName?.trim() || user?.email?.split("@")[0] || "User";
  const initial = displayName.charAt(0).toUpperCase();
  const roleLabel = user?.role
    ? user.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : "Member";

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
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/situs-logo.png"
              alt="Situs Revenue"
              width={57}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </Link>
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
            {initial}
          </div>

          {!collapsed && (
            <div className="text-xs leading-tight">
              <p className="font-medium text-slate-900">{displayName}</p>
              <p className="text-slate-500">{roleLabel}</p>
            </div>
          )}
        </div>
      </div>

    </aside>
  );
}