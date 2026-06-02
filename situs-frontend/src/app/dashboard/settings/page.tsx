"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  User,
  Bell,
  Workflow,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-slate-50">
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">
      {children}
    </div>
  </div>
);

const Card = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-2xl border bg-white shadow-sm p-5"
  >
    <div className="flex items-center gap-2 mb-4">
      <div className="p-2 bg-slate-100 rounded-lg">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
    </div>

    {children}
  </motion.div>
);

/* ================= TYPES ================= */

type AISettings = {
  sensitivity: "Conservative" | "Balanced" | "Aggressive";
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

/* ================= PAGE ================= */

export default function SettingsPage() {
  const router = useRouter();

  const [ai, setAI] = useState<AISettings>({
    sensitivity: "Balanced",
  });

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

  const [saving, setSaving] = useState(false);

  /* ================= SAVE ================= */

  const handleSave = async () => {
    try {
      setSaving(true);
      await new Promise((r) => setTimeout(r, 800));
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  /* ================= UI ================= */

  return (
    <PageContainer>

      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-black mb-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-slate-500">
            Configure your revenue system
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-black text-white rounded-lg text-sm"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* PROFILE */}
      <Card title="Profile" icon={<User size={16} />}>
        <div className="grid md:grid-cols-2 gap-4">
          <Input placeholder="Full Name" />
          <Input placeholder="Email" />
          <Input placeholder="Company" />
          <Input placeholder="Role" />
        </div>
      </Card>

      {/* AI */}
      <Card title="AI Intelligence" icon={<Brain size={16} />}>
        <div className="flex gap-2">
          {(["Conservative", "Balanced", "Aggressive"] as const).map(
            (opt) => (
              <button
                key={opt}
                onClick={() =>
                  setAI((p) => ({ ...p, sensitivity: opt }))
                }
                className={`px-3 py-2 rounded-lg text-sm border ${
                  ai.sensitivity === opt
                    ? "bg-black text-white"
                    : "hover:bg-slate-100"
                }`}
              >
                {opt}
              </button>
            )
          )}
        </div>
      </Card>

      {/* ALERTS */}
      <Card title="Alerts" icon={<Bell size={16} />}>
        {Object.entries(alerts).map(([key, val]) => (
          <div
            key={key}
            className="flex justify-between items-center py-2"
          >
            <span className="capitalize text-sm">{key}</span>

            <Toggle
              enabled={val}
              onChange={() =>
                setAlerts((p) => ({
                  ...p,
                  [key]: !val,
                }))
              }
            />
          </div>
        ))}
      </Card>

      {/* PIPELINE */}
      <Card title="Pipeline" icon={<Workflow size={16} />}>
        {stages.map((stage, i) => (
          <div key={stage.name} className="mb-4">
            <p className="text-sm font-medium">{stage.name}</p>

            <div className="flex gap-3 mt-2">
              <Input
                value={String(stage.days)}
                onChange={(v) => {
                  const copy = [...stages];
                  copy[i].days = Number(v);
                  setStages(copy);
                }}
              />

              <Input
                value={String(stage.conversion)}
                onChange={(v) => {
                  const copy = [...stages];
                  copy[i].conversion = Number(v);
                  setStages(copy);
                }}
              />
            </div>
          </div>
        ))}
      </Card>

      {/* SYSTEM */}
      <Card title="System" icon={<ShieldCheck size={16} />}>
        <button className="px-3 py-2 border rounded-lg text-sm hover:bg-slate-50">
          Manage Access
        </button>
      </Card>

    </PageContainer>
  );
}

/* ================= UI ================= */

function Input({
  value,
  onChange,
  placeholder,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
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
      className={`w-10 h-5 rounded-full transition ${
        enabled ? "bg-black" : "bg-slate-300"
      }`}
    />
  );
}