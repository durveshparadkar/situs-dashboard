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
  Plug,
  Mail,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import toast from "react-hot-toast";
import { apiFetch } from "@/lib/api";
import { OrgCurrency, invalidateOrgCurrencyCache } from "@/lib/currency";

type Sensitivity = "Conservative" | "Balanced" | "Aggressive";
type AISettings = { sensitivity: Sensitivity };
type AlertSettings = { dealRisk: boolean; pipeline: boolean; forecast: boolean };
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
  currency: OrgCurrency;
};

type UserMeResponse = {
  success: boolean;
  data?: {
    _id?: string;
    id?: string;
    fullName?: string;
    email?: string;
    role?: string;
  };
};

type OrgSettingsResponse = {
  success: boolean;
  data?: {
    name?: string;
    plan?: string;
    settings?: {
      aiSensitivity?: Sensitivity;
      alerts?: Partial<AlertSettings>;
      currency?: string;
    };
  };
};

type GmailStatusResponse = {
  success: boolean;
  data?: {
    connected: boolean;
    email: string | null;
    lastSyncedAt: string | null;
    connectedAt: string | null;
  };
};

const ALERT_LABELS: Record<keyof AlertSettings, { label: string; hint: string }> = {
  dealRisk: { label: "Deal risk", hint: "Alert when a deal's risk score spikes" },
  pipeline: { label: "Pipeline", hint: "Alert on stage stagnation and leaks" },
  forecast: { label: "Forecast", hint: "Alert when forecast confidence drops" },
};

const CURRENCY_OPTIONS: Array<{ code: OrgCurrency; label: string }> = [
  { code: "INR", label: "₹ INR — Indian Rupee" },
  { code: "USD", label: "$ USD — US Dollar" },
  { code: "EUR", label: "€ EUR — Euro" },
  { code: "GBP", label: "£ GBP — British Pound" },
];

const VALID_CURRENCIES: readonly OrgCurrency[] = ["INR", "USD", "EUR", "GBP"];

function isOrgCurrency(value: unknown): value is OrgCurrency {
  return typeof value === "string" && (VALID_CURRENCIES as readonly string[]).includes(value);
}

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "ai", label: "Intelligence", icon: Brain },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "pipeline", label: "Pipeline", icon: Workflow },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "system", label: "System", icon: ShieldCheck },
] as const;

function friendlyRole(role: string): string {
  const map: Record<string, string> = {
    ORG_ADMIN: "Admin", SUPER_ADMIN: "Super Admin", MANAGER: "Manager", AGENT: "Agent", USER: "Member",
  };
  return map[role.toUpperCase()] ?? role;
}

function friendlyPlan(plan?: string): string {
  const map: Record<string, string> = { SMALL_BUSINESS: "Small Business", PRO: "Pro", ENTERPRISE: "Enterprise" };
  return plan ? (map[plan.toUpperCase()] ?? plan) : "Small Business";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function FieldRow({
  label, hint, children, last = false,
}: { label: string; hint?: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`grid sm:grid-cols-[200px_1fr] gap-2 sm:gap-8 py-5 ${last ? "" : "border-b border-zinc-100"}`}>
      <div>
        <p className="text-[14px] text-zinc-900">{label}</p>
        {hint && <p className="text-[12.5px] text-zinc-400 mt-0.5">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Input({
  value, onChange, placeholder, readOnly = false,
}: { value?: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={
        "w-full max-w-sm px-0 py-1.5 border-0 border-b text-[14px] text-zinc-900 placeholder:text-zinc-300 bg-transparent outline-none transition " +
        (readOnly
          ? "border-transparent text-zinc-400 cursor-not-allowed"
          : "border-zinc-200 focus:border-zinc-900")
      }
    />
  );
}

function Select({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: Array<{ code: string; label: string }> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-sm px-0 py-1.5 border-0 border-b border-zinc-200 text-[14px] text-zinc-900 bg-transparent outline-none transition focus:border-zinc-900"
    >
      {options.map((opt) => (
        <option key={opt.code} value={opt.code}>{opt.label}</option>
      ))}
    </select>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={enabled}
      className={"relative w-9 h-5 rounded-full transition-colors shrink-0 " + (enabled ? "bg-zinc-900" : "bg-zinc-200")}
    >
      <span
        className={
          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform " +
          (enabled ? "translate-x-4" : "translate-x-0")
        }
      />
    </button>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState<ProfileState>({ userId: "", fullName: "", email: "", company: "", role: "" });
  const [plan, setPlan] = useState("Small Business");
  const [ai, setAI] = useState<AISettings>({ sensitivity: "Balanced" });
  const [alerts, setAlerts] = useState<AlertSettings>({ dealRisk: true, pipeline: true, forecast: true });
  const [currency, setCurrency] = useState<OrgCurrency>("INR");
  const [stages, setStages] = useState<Stage[]>([
    { name: "Leads", days: 3, conversion: 60 },
    { name: "Qualified", days: 6, conversion: 55 },
    { name: "Proposal", days: 8, conversion: 50 },
    { name: "Negotiation", days: 12, conversion: 45 },
  ]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [missingUserId, setMissingUserId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<SavableSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]["id"]>("profile");

  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLastSynced, setGmailLastSynced] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);

  const loadAll = async () => {
    try {
      setLoadError(false);
      const [userRes, orgRes] = await Promise.all([
        apiFetch<UserMeResponse>("/api/auth/me"),
        apiFetch<OrgSettingsResponse>("/api/organizations/me"),
      ]);

      const u = userRes?.data;
      const o = orgRes?.data;

      const resolvedUserId = u?._id ?? u?.id ?? "";
      setMissingUserId(!resolvedUserId);

      const loadedFullName = u?.fullName ?? "";
      const loadedCompany = o?.name ?? "";
      const loadedSensitivity = o?.settings?.aiSensitivity ?? "Balanced";
      const loadedAlerts: AlertSettings = {
        dealRisk: o?.settings?.alerts?.dealRisk ?? true,
        pipeline: o?.settings?.alerts?.pipeline ?? true,
        forecast: o?.settings?.alerts?.forecast ?? true,
      };
      const loadedCurrency: OrgCurrency = isOrgCurrency(o?.settings?.currency)
        ? o!.settings!.currency as OrgCurrency
        : "INR";

      setProfile({
        userId: resolvedUserId,
        fullName: loadedFullName,
        email: u?.email ?? "",
        company: loadedCompany,
        role: u?.role ? friendlyRole(u.role) : "",
      });
      setPlan(friendlyPlan(o?.plan));
      setAI({ sensitivity: loadedSensitivity });
      setAlerts(loadedAlerts);
      setCurrency(loadedCurrency);
      setSavedSnapshot({
        fullName: loadedFullName,
        company: loadedCompany,
        sensitivity: loadedSensitivity,
        alerts: loadedAlerts,
        currency: loadedCurrency,
      });
    } catch (err) {
      console.error("Failed to load settings", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadGmailStatus = async () => {
    try {
      setGmailLoading(true);
      const res = await apiFetch<GmailStatusResponse>("/api/integrations/gmail/status");
      setGmailConnected(res?.data?.connected ?? false);
      setGmailEmail(res?.data?.email ?? null);
      setGmailLastSynced(res?.data?.lastSyncedAt ?? null);
    } catch (err) {
      console.error("Failed to load Gmail status", err);
    } finally {
      setGmailLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    loadGmailStatus();
  }, []);

  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    if (!gmailParam) return;

    if (gmailParam === "connected") {
      toast.success("Gmail connected — syncing your recent emails");
      setActiveTab("integrations");
      loadGmailStatus();
      apiFetch("/api/integrations/gmail/sync-now", { method: "POST" })
        .then(() => loadGmailStatus())
        .catch(() => {});
    } else if (gmailParam === "declined") {
      toast("Gmail connection cancelled");
      setActiveTab("integrations");
    } else if (gmailParam === "error") {
      toast.error("Couldn't connect Gmail — please try again");
      setActiveTab("integrations");
    }

    router.replace("/dashboard/settings");
  }, [router, searchParams]);

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return (
      profile.fullName.trim() !== savedSnapshot.fullName ||
      profile.company.trim() !== savedSnapshot.company ||
      ai.sensitivity !== savedSnapshot.sensitivity ||
      alerts.dealRisk !== savedSnapshot.alerts.dealRisk ||
      alerts.pipeline !== savedSnapshot.alerts.pipeline ||
      alerts.forecast !== savedSnapshot.alerts.forecast ||
      currency !== savedSnapshot.currency
    );
  }, [profile.fullName, profile.company, ai.sensitivity, alerts, currency, savedSnapshot]);

  const handleSave = async () => {
    if (!isDirty) return;

    const nameChanged = profile.fullName.trim() !== savedSnapshot?.fullName;

    if (nameChanged && !profile.userId) {
      toast.error("Couldn't identify your account — refresh the page and try again.");
      return;
    }

    try {
      setSaving(true);
      const requests: Promise<unknown>[] = [];

      if (profile.userId && nameChanged) {
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
              alerts: { dealRisk: alerts.dealRisk, pipeline: alerts.pipeline, forecast: alerts.forecast },
              currency,
            },
          }),
        })
      );

      await Promise.all(requests);

      if (currency !== savedSnapshot?.currency) {
        invalidateOrgCurrencyCache();
      }

      setSavedSnapshot({
        fullName: profile.fullName.trim(),
        company: profile.company.trim(),
        sensitivity: ai.sensitivity,
        alerts: { ...alerts },
        currency,
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
    setCurrency(savedSnapshot.currency);
  };

  const handleConnectGmail = () => {
    window.location.href = "https://api.situsrevenue.com/api/integrations/gmail/connect";
  };

  const handleSyncNow = async () => {
    try {
      setGmailSyncing(true);
      const res = await apiFetch<{ success: boolean; message?: string }>(
        "/api/integrations/gmail/sync-now",
        { method: "POST" }
      );
      toast.success(res?.message ?? "Sync complete");
      await loadGmailStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setGmailSyncing(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm("Disconnect Gmail? Activity sync will stop until you reconnect.")) return;
    try {
      setGmailDisconnecting(true);
      await apiFetch("/api/integrations/gmail", { method: "DELETE" });
      toast.success("Gmail disconnected");
      setGmailConnected(false);
      setGmailEmail(null);
      setGmailLastSynced(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setGmailDisconnecting(false);
    }
  };

  const sensitivityHint: Record<Sensitivity, string> = {
    Conservative: "Fewer alerts — only the most certain signals surface.",
    Balanced: "A measured mix of signal and noise. Recommended for most teams.",
    Aggressive: "Surface everything early — more alerts, more false positives.",
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div className="h-8 w-40 bg-zinc-100 rounded animate-pulse" />
        <div className="h-64 bg-zinc-50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-28">

      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-2 text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors mb-8"
      >
        <ArrowLeft size={15} />
        Back
      </button>

      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-[26px] font-semibold text-zinc-900 tracking-tight">Settings</h1>
          <p className="text-[14px] text-zinc-400 mt-1">
            {profile.company || "Your workspace"} · {plan}
          </p>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 mb-8">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={15} className="text-red-500 shrink-0" />
            <p className="text-[13px] text-red-600">Couldn&apos;t load your settings.</p>
          </div>
          <button onClick={() => { setLoading(true); loadAll(); }} className="text-[13px] font-medium text-red-600 underline">
            Retry
          </button>
        </div>
      )}

      {missingUserId && !loadError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 mb-8">
          <AlertCircle size={15} className="text-amber-500 shrink-0" />
          <p className="text-[13px] text-amber-700">
            Couldn&apos;t confirm your account ID — name changes may not save. Try refreshing.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-zinc-100 mb-10 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={
                "flex items-center gap-2 px-4 py-3 text-[13.5px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors " +
                (active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-600")
              }
            >
              <Icon size={14} strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "profile" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div className="flex items-center gap-4 mb-8">
            <div className="relative shrink-0">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-100 text-zinc-700 font-medium text-[17px]">
                {initialsFromName(profile.fullName || profile.email)}
              </div>
              <button
                title="Change photo (coming soon)"
                className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 text-white ring-2 ring-white"
              >
                <Camera size={10} />
              </button>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-zinc-900 truncate">
                {profile.fullName || <span className="text-zinc-300 font-normal">No name set yet</span>}
              </p>
              <p className="text-[13px] text-zinc-400 truncate">{profile.email}</p>
            </div>
          </div>

          <FieldRow label="Full name">
            <Input value={profile.fullName} onChange={(v) => setProfile((p) => ({ ...p, fullName: v }))} placeholder="e.g. Durvesh Paradkar" />
          </FieldRow>
          <FieldRow label="Email" hint="Contact support to change">
            <Input value={profile.email} readOnly />
          </FieldRow>
          <FieldRow label="Company">
            <Input value={profile.company} onChange={(v) => setProfile((p) => ({ ...p, company: v }))} placeholder="Company name" />
          </FieldRow>
          <FieldRow label="Currency" hint="All deals and reports across your workspace use this currency">
            <Select value={currency} onChange={(v) => setCurrency(v as OrgCurrency)} options={CURRENCY_OPTIONS} />
          </FieldRow>
          <FieldRow label="Role" hint="Assigned by your admin" last>
            <Input value={profile.role} readOnly />
          </FieldRow>
        </motion.div>
      )}

      {activeTab === "ai" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="space-y-3">
          <p className="text-[13.5px] text-zinc-400 mb-5">Tune how aggressively the engine surfaces risks and actions.</p>
          {(["Conservative", "Balanced", "Aggressive"] as const).map((opt) => {
            const active = ai.sensitivity === opt;
            return (
              <button
                key={opt}
                onClick={() => setAI({ sensitivity: opt })}
                className={
                  "w-full text-left rounded-xl border p-4 transition-all " +
                  (active ? "border-zinc-900" : "border-zinc-100 hover:border-zinc-300")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-zinc-900">{opt}</span>
                  {active && (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-zinc-900">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-zinc-400 mt-1">{sensitivityHint[opt]}</p>
              </button>
            );
          })}
        </motion.div>
      )}

      {activeTab === "alerts" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          {(Object.keys(alerts) as Array<keyof AlertSettings>).map((key, i, arr) => (
            <FieldRow key={key} label={ALERT_LABELS[key].label} hint={ALERT_LABELS[key].hint} last={i === arr.length - 1}>
              <Toggle enabled={alerts[key]} onChange={() => setAlerts((p) => ({ ...p, [key]: !p[key] }))} />
            </FieldRow>
          ))}
        </motion.div>
      )}

      {activeTab === "pipeline" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <p className="text-[13.5px] text-zinc-400 mb-5">Set the expected duration and conversion rate for each stage.</p>
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 pb-2 mb-1 border-b border-zinc-100">
            <span className="text-[11px] text-zinc-400">Stage</span>
            <span className="text-[11px] text-zinc-400 w-20 text-center">Avg days</span>
            <span className="text-[11px] text-zinc-400 w-20 text-center">Conversion</span>
          </div>
          <div className="space-y-1">
            {stages.map((stage, i) => (
              <div key={stage.name} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 sm:items-center py-2">
                <span className="text-[13.5px] text-zinc-900">{stage.name}</span>
                <div className="sm:w-20">
                  <Input value={String(stage.days)} onChange={(v) => { const c = [...stages]; c[i] = { ...c[i], days: Number(v) || 0 }; setStages(c); }} />
                </div>
                <div className="sm:w-20">
                  <Input value={String(stage.conversion)} onChange={(v) => { const c = [...stages]; c[i] = { ...c[i], conversion: Number(v) || 0 }; setStages(c); }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-zinc-300 mt-5">Pipeline stage sync is coming soon.</p>
        </motion.div>
      )}

      {activeTab === "integrations" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <p className="text-[13.5px] text-zinc-400 mb-6">
            Connect your tools so Situs sees real activity automatically — no manual logging.
          </p>

          <div className="rounded-xl border border-zinc-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 shrink-0">
                  <Mail size={16} className="text-red-500" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-zinc-900">Gmail</p>
                  {gmailLoading ? (
                    <p className="text-[12.5px] text-zinc-400 mt-0.5">Checking connection…</p>
                  ) : gmailConnected ? (
                    <>
                      <p className="text-[12.5px] text-emerald-600 mt-0.5">
                        Connected as {gmailEmail}
                      </p>
                      <p className="text-[11.5px] text-zinc-400 mt-1">
                        Last synced: {timeAgo(gmailLastSynced)}
                      </p>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-zinc-400 mt-0.5">
                      Auto-log emails as activity on matching leads
                    </p>
                  )}
                </div>
              </div>

              {!gmailLoading && (
                gmailConnected ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleSyncNow}
                      disabled={gmailSyncing}
                      title="Sync now"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={gmailSyncing ? "animate-spin" : ""} />
                      {gmailSyncing ? "Syncing…" : "Sync now"}
                    </button>
                    <button
                      onClick={handleDisconnectGmail}
                      disabled={gmailDisconnecting}
                      title="Disconnect"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Unlink size={12} />
                      {gmailDisconnecting ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGmail}
                    className="px-4 py-1.5 bg-zinc-900 text-white rounded-lg text-[13px] font-medium hover:bg-zinc-700 transition-colors shrink-0"
                  >
                    Connect
                  </button>
                )
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100 p-5 mt-3 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-50 shrink-0">
                <Plug size={16} className="text-purple-500" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-zinc-900">Slack</p>
                <p className="text-[12.5px] text-zinc-400 mt-0.5">Coming soon</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === "system" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <p className="text-[13.5px] text-zinc-400 mb-5">Access control and administrative settings.</p>
          <button className="text-[13.5px] font-medium text-zinc-900 underline underline-offset-4">
            Manage access
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {(isDirty || (lastSavedAt && !isDirty)) && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-0 left-0 right-0 border-t border-zinc-100 bg-white/95 backdrop-blur-sm z-40"
          >
            <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
              <p className={"text-[13px] " + (isDirty ? "text-zinc-500" : "text-zinc-400")}>
                {isDirty ? "Unsaved changes" : lastSavedAt && `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </p>
              {isDirty && (
                <div className="flex items-center gap-2">
                  <button onClick={handleDiscard} disabled={saving} className="text-[13px] text-zinc-400 hover:text-zinc-700 px-3 py-1.5">
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-1.5 bg-zinc-900 text-white rounded-lg text-[13px] font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
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

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
          <div className="h-8 w-40 bg-zinc-100 rounded animate-pulse" />
          <div className="h-64 bg-zinc-50 rounded-2xl animate-pulse" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}