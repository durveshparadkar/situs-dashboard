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

/* ---------------- TYPES ---------------- */

type AISettings = {
  sensitivity: "Conservative" | "Balanced" | "Aggressive";
  frequency: "Real-time" | "Hourly" | "Daily";
  mode: "Assistive" | "Directive";
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

/* ---------------- REUSABLE COMPONENTS ---------------- */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Card({
  icon,
  title,
  description,
  children,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
        <div className="flex flex-1 gap-3">
          <div className="rounded-xl bg-slate-50 p-2.5">{icon}</div>

          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-sm text-slate-500">{description}</p>
            </div>

            {children}
          </div>
        </div>

        {right && (
          <div className="xl:w-64 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {right}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ---------------- MAIN PAGE ---------------- */

export default function SettingsPage() {
  const router = useRouter();

  const [ai, setAI] = useState<AISettings>({
    sensitivity: "Balanced",
    frequency: "Real-time",
    mode: "Assistive",
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

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-6 py-6">
      {/* HEADER */}
      <header className="space-y-2">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Settings
        </h1>

        <p className="text-sm text-slate-500">
          Configure how your revenue system behaves and makes decisions.
        </p>
      </header>

      {/* PROFILE */}
      <Section
        title="Profile & Business Context"
        subtitle="Used by the system to personalize insights and forecasting."
      >
        <Card
          icon={<User size={18} />}
          title="Profile Identity"
          description="Basic account and business context."
          right={
            <>
              <p className="text-xs uppercase text-slate-400">
                System Impact
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Improves AI accuracy and personalization.
              </p>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className="input" placeholder="Full Name" />
            <input className="input" placeholder="Email" />
            <input className="input" placeholder="Company" />
            <input className="input" placeholder="Role" />
          </div>
        </Card>
      </Section>

      {/* AI */}
      <Section
        title="AI Intelligence"
        subtitle="Control how the system detects risk and generates insights."
      >
        <Card
          icon={<Brain size={18} />}
          title="AI Behavior"
          description="Tune how aggressive and responsive the system is."
          right={
            <p className="text-sm text-slate-600">
              More aggressive = earlier signals but more noise.
            </p>
          }
        >
          <div className="flex flex-wrap gap-2">
            {(["Conservative", "Balanced", "Aggressive"] as const).map(
              (opt) => (
                <button
                  key={opt}
                  onClick={() =>
                    setAI((prev) => ({ ...prev, sensitivity: opt }))
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    ai.sensitivity === opt
                      ? "bg-slate-900 text-white"
                      : "hover:bg-slate-100"
                  }`}
                >
                  {opt}
                </button>
              )
            )}
          </div>
        </Card>
      </Section>

      {/* ALERTS */}
      <Section
        title="Alerts & Notifications"
        subtitle="Choose what signals should interrupt your workflow."
      >
        <Card
          icon={<Bell size={18} />}
          title="Alert Types"
          description="Enable or disable alert categories."
          right={<p className="text-sm text-slate-600">Reduces noise.</p>}
        >
          {(Object.entries(alerts) as [keyof AlertSettings, boolean][]).map(
            ([key, val]) => (
              <div
                key={key}
                className="flex items-center justify-between text-sm"
              >
                <span className="capitalize">{key}</span>

                <button
                  onClick={() =>
                    setAlerts((prev) => ({
                      ...prev,
                      [key]: !val,
                    }))
                  }
                  className={`h-5 w-10 rounded-full ${
                    val ? "bg-slate-900" : "bg-slate-300"
                  }`}
                />
              </div>
            )
          )}
        </Card>
      </Section>

      {/* PIPELINE */}
      <Section
        title="Pipeline Configuration"
        subtitle="Define how deals move through your revenue system."
      >
        {stages.map((stage, index) => (
          <Card
            key={stage.name}
            icon={<Workflow size={18} />}
            title={stage.name}
            description="Configure expected behavior in this stage."
            right={
              <>
                <p className="text-xs uppercase text-slate-400">Impact</p>
                <p className="text-sm text-slate-700">
                  Affects forecasting & risk scoring
                </p>
              </>
            }
          >
            <div className="flex gap-3">
              <input
                value={stage.days}
                onChange={(e) => {
                  const updated = [...stages];
                  updated[index].days = Number(e.target.value);
                  setStages(updated);
                }}
                className="input w-24"
              />

              <input
                value={stage.conversion}
                onChange={(e) => {
                  const updated = [...stages];
                  updated[index].conversion = Number(e.target.value);
                  setStages(updated);
                }}
                className="input w-24"
              />
            </div>
          </Card>
        ))}
      </Section>

      {/* SYSTEM */}
      <Section
        title="System Control"
        subtitle="Control access and system-level behavior."
      >
        <Card
          icon={<ShieldCheck size={18} />}
          title="Permissions"
          description="Manage access and control settings."
          right={<p className="text-sm text-slate-600">Admin only</p>}
        >
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50">
            Manage Access
          </button>
        </Card>
      </Section>
    </div>
  );
}