"use client";

import { useState, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  User,
  Bell,
  Workflow,
  ShieldCheck,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { apiFetch } from "@/lib/api";

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">{children}</div>
);

const Card = ({
  title,
  description,
  icon,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -3 }}
    className={ `rounded-2xl border border-black/[0.06] bg-white shadow-sm p-5 transition ${className}` }
  >
    <div className="flex items-start gap-3 mb-5">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900/[0.03] ring-1 ring-black/[0.06] shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-zinc-900 tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-[12.5px] text-zinc-500 mt-0.5">{description}</p>
        )}
      </div>
    </div>

    {children}
  </motion.div>
);

/* ================= TYPES ================= */

type Sensitivity = "Conservative" | "Balanced" | "Aggressive";

type AISettings = {
  sensitivity: Sensitivity;
};

type AlertSettings = {
  dealRisk: boolean;
  pipeline: boolean;
  forecast: boolean;
};

type Stage = {
  name: string;
  days: number;
  conversion: number;
};

type ProfileState = {
  userId: string;
  fullName: string;
  email: string;
  company: string;
  role: string;
};

/* Backend response shapes (only fields we care about) */
type UserMeResponse = {
  success: boolean;
  data?: {
    _id?: string;
    fullName?: string;
    email?: string;
    role?: string;
  };
};

type OrgSettingsResponse = {
  success: boolean;
  data?: {
    name?: string;
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

/* Friendly role labels for display */
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
  const [saving, setSaving] = useState(false);

  /* ================= LOAD PROFILE + ORG SETTINGS ================= */

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [userRes, orgRes] = await Promise.all([
          apiFetch<UserMeResponse>("/api/users/me"),
          apiFetch<OrgSettingsResponse>("/api/organizations/me"),
        ]);

        const u = userRes?.data;
        const o = orgRes?.data;

        setProfile({
          userId: u?._id ?? "",
          fullName: u?.fullName ?? "",
          email: u?.email ?? "",
          company: o?.name ?? "",
          role: u?.role ? friendlyRole(u.role) : "",
        });

        if (o?.settings?.aiSensitivity) {
          setAI({ sensitivity: o.settings.aiSensitivity });
        }

        if (o?.settings?.alerts) {
          setAlerts((prev) => ({
            ...prev,
            ...o.settings?.alerts,
          }));
        }
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, []);

  /* ================= SAVE ================= */

  const handleSave = async () => {
    try {
      setSaving(true);

      /* Run profile + org updates in parallel — independent resources */
      const requests: Promise<unknown>[] = [];

      /* Only update the user if we have their ID and a name to save */
      if (profile.userId && profile.fullName.trim()) {
        requests.push(
          apiFetch(`/api/users/${profile.userId}`, {
            method: "PATCH",
            body: JSON.stringify({ fullName: profile.fullName.trim() }),
          })
        );
      }

      /* Org update covers company name + AI sensitivity + alerts together */
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

      toast.success("Settings saved");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const sensitivityHint: Record<Sensitivity, string> = {
    Conservative: "Fewer alerts — only the most certain signals surface.",
    Balanced: "A measured mix of signal and noise. Recommended for most teams.",
    Aggressive: "Surface everything early — more alerts, more false positives.",
  };

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <PageContainer>
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-16 bg-slate-200 rounded-md" />
          <div className="h-7 w-40 bg-slate-200 rounded-md" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </PageContainer>
    );
  }

  /* ================= UI ================= */

  return (
    <PageContainer>

      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-zinc-900 transition-colors mb-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
          <p className="text-sm text-slate-500">
            Configure your revenue system
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>

      {/* PROFILE — wired to backend */}
      <Card
        title="Profile"
        description="Your account details and how you appear across Situs."
        icon={<User size={17} className="text-zinc-700" strokeWidth={2} />}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Full name">
            <Input
              value={profile.fullName}
              onChange={(v) => setProfile((p) => ({ ...p, fullName: v }))}
              placeholder="e.g. Durvesh Paradkar"
            />
          </Field>
          <Field label="Email">
            <Input value={profile.email} readOnly />
          </Field>
          <Field label="Company">
            <Input
              value={profile.company}
              onChange={(v) => setProfile((p) => ({ ...p, company: v }))}
              placeholder="Company name"
            />
          </Field>
          <Field label="Role">
            <Input value={profile.role} readOnly />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-400 mt-3">
          Email and role can&apos;t be changed here. Contact support if you need
          to update them.
        </p>
      </Card>

      {/* AI INTELLIGENCE — wired to backend */}
      <Card
        title="AI Intelligence"
        description="Tune how aggressively the engine surfaces risks and actions."
        icon={<Brain size={17} className="text-zinc-700" strokeWidth={2} />}
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
      </Card>

      {/* ALERTS — wired to backend */}
      <Card
        title="Alerts"
        description="Choose which signals generate alerts on your dashboard."
        icon={<Bell size={17} className="text-zinc-700" strokeWidth={2} />}
      >
        <div className="divide-y divide-black/[0.05]">
          {(Object.keys(alerts) as Array<keyof AlertSettings>).map((key) => (
            <div key={key} className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0">
              <div>
                <p className="text-[13.5px] font-medium text-zinc-900">
                  {ALERT_LABELS[key].label}
                </p>
                <p className="text-[12px] text-zinc-500 mt-0.5">
                  {ALERT_LABELS[key].hint}
                </p>
              </div>
              <Toggle
                enabled={alerts[key]}
                onChange={() => setAlerts((p) => ({ ...p, [key]: !p[key] }))}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* PIPELINE — local only for now */}
      <Card
        title="Pipeline"
        description="Set the expected duration and conversion rate for each stage."
        icon={<Workflow size={17} className="text-zinc-700" strokeWidth={2} />}
      >
        <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-1 pb-2 mb-1 border-b border-black/[0.05]">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">
            Stage
          </span>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400 w-24 text-center">
            Avg days
          </span>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400 w-24 text-center">
            Conversion %
          </span>
        </div>

        <div className="space-y-3">
          {stages.map((stage, i) => (
            <div
              key={stage.name}
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 sm:items-center"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                <span className="text-[13.5px] font-medium text-zinc-900">
                  {stage.name}
                </span>
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
        <p className="text-[11px] text-zinc-400 mt-3">
          Pipeline stage sync is coming soon.
        </p>
      </Card>

      {/* SYSTEM */}
      <Card
        title="System"
        description="Access control and administrative settings."
        icon={<ShieldCheck size={17} className="text-zinc-700" strokeWidth={2} />}
      >
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-black/[0.08] rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-black/[0.16] transition-colors">
          Manage access
        </button>
      </Card>

    </PageContainer>
  );
}

/* ================= UI PRIMITIVES ================= */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium text-zinc-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
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
        "w-full px-3 py-2 border border-black/[0.10] rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition " +
        (readOnly ? "bg-zinc-50 text-zinc-500 cursor-not-allowed" : "")
      }
    />
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: () => void;
}) {
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