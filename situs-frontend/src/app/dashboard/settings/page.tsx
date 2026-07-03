"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  User,
  Bell,
  Workflow,
  ShieldCheck,
  Check,
  AlertCircle,
  Camera,
  Building2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { apiFetch } from "@/lib/api";

/* ================= TYPES ================= */

type Sensitivity = "Conservative" | "Balanced" | "Aggressive";

type AISettings = { sensitivity: Sensitivity };

type AlertSettings = {
  dealRisk: boolean;
  pipeline: boolean;
  forecast: boolean;
};

type Stage = { name: string; days: number; conversion: number };

type ProfileState = {
  userId: string;
  fullName: string;
  email: string;
  company: string;
  role: string;
};

type SavableSnapshot = {
  fullName: string;
  company: string;
  sensitivity: Sensitivity;
  alerts: AlertSettings;
};

type UserMeResponse = {
  success: boolean;
  data?: { _id?: string; fullName?: string; email?: string; role?: string };
};

type OrgSettingsResponse = {
  success: boolean;
  data?: {
    name?: string;
    plan?: string;
    settings?: {
      aiSensitivity?: Sensitivity;
      alerts?: Partial<AlertSettings>;
    };
  };
};

const ALERT_LABELS: Record<keyof AlertSettings, { label: string; hint: string }> = {
  dealRisk: { label: "Deal risk", hint: "Alert when a deal's risk score spikes" },
  pipeline: { label: "Pipeline", hint: "Alert on stage stagnation and leaks" },
  forecast: { label: "Forecast", hint: "Alert when forecast confidence drops" },
};

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "ai", label: "AI Intelligence", icon: Brain },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "pipeline", label: "Pipeline", icon: Workflow },
  { id: "system", label: "System", icon: ShieldCheck },
] as const;

function friendlyRole(role: string): string {
  const map: Record<string, string> = {
    ORG_ADMIN: "Admin",
    SUPER_ADMIN: "Super Admin",
    MANAGER: "Manager",
    AGENT: "Agent",
    USER: "Member",
  };
  return map[role.toUpperCase()] ?? role;
}

function friendlyPlan(plan?: string): string {
  const map: Record<string, string> = {
    SMALL_BUSINESS: "Small Business",
    PRO: "Pro",
    ENTERPRISE: "Enterprise",
  };
  return plan ? (map[plan.toUpperCase()] ?? plan) : "Small Business";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/* ================= SHARED UI ================= */

function SectionCard({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-black/[0.06] bg-white shadow-sm p-6 scroll-mt-24"
    >
      <div className="flex items-start gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900/[0.03] ring-1 ring-black/[0.06] shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-zinc-900 tracking-tight">
            {title}
          </h2>
          {description && (
            <p className="text-[13px] text-zinc-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

/* Field row — label + value on one line, divided by hairlines.
   Reads more premium than bordered-box grids. */
function FieldRow({
  label,
  hint,
  children,
  last = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid sm:grid-cols-[180px_1fr] gap-2 sm:gap-6 py-4 ${
        last ? "" : "border-b border-black/[0.05]"
      }`}
    >
      <div className="pt-2">
        <p className="text-[13px] font-medium text-zinc-700">{label}</p>
        {hint && <p className="text-[11.5px] text-zinc-400 mt-0.5">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  readOnly = false,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={
        "w-full max-w-md px-3.5 py-2.5 border border-black/[0.10] rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition " +
        (readOnly ? "bg-zinc-50 text-zinc-500 cursor-not-allowed" : "bg-white")
      }
    />
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={enabled}
      className={
        "relative w-10 h-5.5 rounded-full transition-colors shrink-0 " +
        (enabled ? "bg-emerald-500" : "bg-slate-300")
      }
      style={{ height: "1.375rem" }}
    >
      <span
        className={
          "absolute top-0.5 left-0.5 w-[1.125rem] h-[1.125rem] rounded-full bg-white shadow-sm transition-transform " +
          (enabled ? "translate-x-[1.125rem]" : "translate-x-0")
        }
      />
    </button>
  );
}

/* ================= PAGE ================= */

export default function SettingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileState>({
    userId: "",
    fullName: "",
    email: "",
    company: "",
    role: "",
  });

  const [plan, setPlan] = useState("Small Business");

  const [ai, setAI] = useState<AISettings>({ sensitivity: "Balanced" });

  const [alerts, setAlerts] = useState<AlertSettings>({
    dealRisk: true,
    pipeline: true,
    forecast: true,
  });

  const [stages, setStages] = useState<Stage[]>([
    { name: "Leads", days: 3, conversion: 60 },
    { name: "Qualified", days: 6, conversion: 55 },
    { name: "Proposal", days: 8, conversion: 50 },
    { name: "Negotiation", days: 12, conversion: 45 },
  ]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<SavableSnapshot | null>(null);
  const [activeSection, setActiveSection] = useState("profile");

  /* ================= LOAD ================= */

  const loadAll = async () => {
    try {
      setLoadError(false);

      const [userRes, orgRes] = await Promise.all([
        apiFetch<UserMeResponse>("/api/users/me"),
        apiFetch<OrgSettingsResponse>("/api/organizations/me"),
      ]);

      const u = userRes?.data;
      const o = orgRes?.data;

      const loadedFullName = u?.fullName ?? "";
      const loadedCompany = o?.name ?? "";
      const loadedSensitivity = o?.settings?.aiSensitivity ?? "Balanced";
      const loadedAlerts: AlertSettings = {
        dealRisk: o?.settings?.alerts?.dealRisk ?? true,
        pipeline: o?.settings?.alerts?.pipeline ?? true,
        forecast: o?.settings?.alerts?.forecast ?? true,
      };

      setProfile({
        userId: u?._id ?? "",
        fullName: loadedFullName,
        email: u?.email ?? "",
        company: loadedCompany,
        role: u?.role ? friendlyRole(u.role) : "",
      });

      setPlan(friendlyPlan(o?.plan));
      setAI({ sensitivity: loadedSensitivity });
      setAlerts(loadedAlerts);

      setSavedSnapshot({
        fullName: loadedFullName,
        company: loadedCompany,
        sensitivity: loadedSensitivity,
        alerts: loadedAlerts,
      });
    } catch (err) {
      console.error("Failed to load settings", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
     
  }, []);

  /* ================= DIRTY STATE ================= */

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return (
      profile.fullName.trim() !== savedSnapshot.fullName ||
      profile.company.trim() !== savedSnapshot.company ||
      ai.sensitivity !== savedSnapshot.sensitivity ||
      alerts.dealRisk !== savedSnapshot.alerts.dealRisk ||
      alerts.pipeline !== savedSnapshot.alerts.pipeline ||
      alerts.forecast !== savedSnapshot.alerts.forecast
    );
  }, [profile.fullName, profile.company, ai.sensitivity, alerts, savedSnapshot]);

  /* ================= SAVE ================= */

  const handleSave = async () => {
    if (!isDirty) return;
    try {
      setSaving(true);

      const requests: Promise<unknown>[] = [];

      if (profile.userId && profile.fullName.trim() !== savedSnapshot?.fullName) {
        requests.push(
          apiFetch(`/api/users/${profile.userId}`, {
            method: "PATCH",
            body: JSON.stringify({ fullName: profile.fullName.trim() }),
          })
        );
      }

      requests.push(
        apiFetch("/api/organizations/me", {
          method: "PATCH",
          body: JSON.stringify({
            ...(profile.company.trim() && { name: profile.company.trim() }),
            settings: {
              aiSensitivity: ai.sensitivity,
              alerts: {
                dealRisk: alerts.dealRisk,
                pipeline: alerts.pipeline,
                forecast: alerts.forecast,
              },
            },
          }),
        })
      );

      await Promise.all(requests);

      setSavedSnapshot({
        fullName: profile.fullName.trim(),
        company: profile.company.trim(),
        sensitivity: ai.sensitivity,
        alerts: { ...alerts },
      });

      setLastSavedAt(new Date());
      toast.success("Settings saved");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!savedSnapshot) return;
    setProfile((p) => ({ ...p, fullName: savedSnapshot.fullName, company: savedSnapshot.company }));
    setAI({ sensitivity: savedSnapshot.sensitivity });
    setAlerts(savedSnapshot.alerts);
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sensitivityHint: Record<Sensitivity, string> = {
    Conservative: "Fewer alerts — only the most certain signals surface.",
    Balanced: "A measured mix of signal and noise. Recommended for most teams.",
    Aggressive: "Surface everything early — more alerts, more false positives.",
  };

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="h-36 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-[220px_1fr] gap-8">
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse hidden lg:block" />
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-28">

      {/* BACK */}
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-zinc-900 transition-colors mb-5"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* WORKSPACE HERO — matches dashboard's dark gradient hero cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 text-white p-7 mb-8 relative overflow-hidden"
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 ring-1 ring-white/20">
              <Building2 size={22} className="text-white/90" />
            </div>
            <div>
              <p className="text-[18px] font-semibold tracking-tight">
                {profile.company || "Your Workspace"}
              </p>
              <p className="text-[12.5px] text-white/50 mt-0.5">
                Settings &amp; configuration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
              {plan} Plan
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] px-3 py-1.5 rounded-full bg-white/10 text-white/70 ring-1 ring-white/20">
              {profile.role || "Member"}
            </span>
          </div>
        </div>
      </motion.div>

      {/* LOAD ERROR */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={16} className="text-red-600 shrink-0" />
            <p className="text-sm text-red-700">
              Couldn&apos;t load your settings. Some fields may be empty.
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); loadAll(); }}
            className="text-sm font-medium text-red-700 hover:text-red-900 underline shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-8 items-start">

        {/* STICKY SECTION NAV */}
        <nav className="hidden lg:block sticky top-8 space-y-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors text-left " +
                  (active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100")
                }
              >
                <Icon size={15} strokeWidth={2} />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* CONTENT */}
        <div className="space-y-6 min-w-0">

          {/* PROFILE */}
          <SectionCard
            id="profile"
            title="Profile"
            description="Your account details and how you appear across Situs."
            icon={<User size={18} className="text-zinc-700" strokeWidth={2} />}
          >
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-black/[0.05]">
              <div className="relative shrink-0">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 ring-1 ring-emerald-200/60 text-emerald-700 font-semibold text-xl">
                  {initialsFromName(profile.fullName || profile.email)}
                </div>
                <button
                  title="Change photo (coming soon)"
                  className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900 text-white ring-2 ring-white hover:bg-zinc-700 transition-colors"
                >
                  <Camera size={11} />
                </button>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-zinc-900 truncate">
                  {profile.fullName || (
                    <span className="text-zinc-400 font-normal italic">No name set yet</span>
                  )}
                </p>
                <p className="text-[12.5px] text-zinc-500 truncate">{profile.email}</p>
              </div>
            </div>

            <FieldRow label="Full name" hint="Shown across your workspace">
              <Input
                value={profile.fullName}
                onChange={(v) => setProfile((p) => ({ ...p, fullName: v }))}
                placeholder="e.g. Durvesh Paradkar"
              />
            </FieldRow>
            <FieldRow label="Email" hint="Contact support to change">
              <Input value={profile.email} readOnly />
            </FieldRow>
            <FieldRow label="Company" hint="Your organization's display name">
              <Input
                value={profile.company}
                onChange={(v) => setProfile((p) => ({ ...p, company: v }))}
                placeholder="Company name"
              />
            </FieldRow>
            <FieldRow label="Role" hint="Assigned by your admin" last>
              <Input value={profile.role} readOnly />
            </FieldRow>
          </SectionCard>

          {/* AI INTELLIGENCE */}
          <SectionCard
            id="ai"
            title="AI Intelligence"
            description="Tune how aggressively the engine surfaces risks and actions."
            icon={<Brain size={18} className="text-zinc-700" strokeWidth={2} />}
          >
            <div className="grid sm:grid-cols-3 gap-3">
              {(["Conservative", "Balanced", "Aggressive"] as const).map((opt) => {
                const active = ai.sensitivity === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setAI({ sensitivity: opt })}
                    className={
                      "text-left rounded-xl border p-4 transition-all " +
                      (active
                        ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200/60"
                        : "border-black/[0.08] hover:border-black/[0.16] hover:bg-zinc-50")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={
                          "text-[13.5px] font-semibold " +
                          (active ? "text-emerald-800" : "text-zinc-900")
                        }
                      >
                        {opt}
                      </span>
                      {active && (
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500">
                          <Check size={11} className="text-white" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-zinc-500 mt-1.5 leading-relaxed">
                      {sensitivityHint[opt]}
                    </p>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* ALERTS */}
          <SectionCard
            id="alerts"
            title="Alerts"
            description="Choose which signals generate alerts on your dashboard."
            icon={<Bell size={18} className="text-zinc-700" strokeWidth={2} />}
          >
            {(Object.keys(alerts) as Array<keyof AlertSettings>).map((key, i, arr) => (
              <FieldRow
                key={key}
                label={ALERT_LABELS[key].label}
                hint={ALERT_LABELS[key].hint}
                last={i === arr.length - 1}
              >
                <Toggle
                  enabled={alerts[key]}
                  onChange={() => setAlerts((p) => ({ ...p, [key]: !p[key] }))}
                />
              </FieldRow>
            ))}
          </SectionCard>

          {/* PIPELINE */}
          <SectionCard
            id="pipeline"
            title="Pipeline"
            description="Set the expected duration and conversion rate for each stage."
            icon={<Workflow size={18} className="text-zinc-700" strokeWidth={2} />}
          >
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-1 pb-2 mb-1 border-b border-black/[0.05]">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">Stage</span>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400 w-24 text-center">Avg days</span>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400 w-24 text-center">Conversion %</span>
            </div>
            <div className="space-y-3">
              {stages.map((stage, i) => (
                <div key={stage.name} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 sm:items-center">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                    <span className="text-[13.5px] font-medium text-zinc-900">{stage.name}</span>
                  </div>
                  <div className="sm:w-24">
                    <Input
                      value={String(stage.days)}
                      onChange={(v) => {
                        const copy = [...stages];
                        copy[i] = { ...copy[i], days: Number(v) || 0 };
                        setStages(copy);
                      }}
                    />
                  </div>
                  <div className="sm:w-24">
                    <Input
                      value={String(stage.conversion)}
                      onChange={(v) => {
                        const copy = [...stages];
                        copy[i] = { ...copy[i], conversion: Number(v) || 0 };
                        setStages(copy);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400 mt-4">
              Pipeline stage sync is coming soon.
            </p>
          </SectionCard>

          {/* SYSTEM */}
          <SectionCard
            id="system"
            title="System"
            description="Access control and administrative settings."
            icon={<ShieldCheck size={18} className="text-zinc-700" strokeWidth={2} />}
          >
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-black/[0.08] rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-black/[0.16] transition-colors">
              Manage access
            </button>
          </SectionCard>

        </div>
      </div>

      {/* STICKY SAVE BAR — slides up only when there's something to save */}
      <AnimatePresence>
        {(isDirty || (lastSavedAt && !isDirty)) && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] bg-white/95 backdrop-blur-md"
          >
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <div>
                {isDirty ? (
                  <p className="text-[13px] font-medium text-amber-700 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    You have unsaved changes
                  </p>
                ) : (
                  lastSavedAt && (
                    <p className="text-[13px] font-medium text-emerald-700 flex items-center gap-1.5">
                      <Check size={13} strokeWidth={3} />
                      Saved at {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )
                )}
              </div>

              {isDirty && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDiscard}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}