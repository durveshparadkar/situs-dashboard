"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Calendar, Mail, Trash2, UserCircle2 } from "lucide-react";
import toast from "react-hot-toast";

import DrawerShell from "./shared/drawer-shell";
import { apiFetch } from "@/lib/api";

interface Lead {
  _id?: string;
  name: string;
  email?: string | null;
  phone: string;
  interestedLocation: string;
  budget?: number;
  source?: string;
  probability?: number;
  leadScore?: number;
  brainPriority?: "low" | "medium" | "high" | "critical";
  createdAt?: string;
}

type LeadResponse = {
  data: Lead;
};

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onUpdate: (lead: Lead) => void;
}

const SOURCE_OPTIONS = [
  "MANUAL_ENTRY",
  "WEBSITE",
  "WEBSITE_FORM",
  "PHONE_INBOUND",
  "COLD_CALL",
  "COLD_EMAIL",
  "CUSTOMER_REFERRAL",
  "WALKIN",
  "OTHER",
];

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function LeadDrawer({ lead, onClose, onUpdate }: Props) {
  const isEdit = Boolean(lead?._id && lead._id.trim().length > 0);

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [source, setSource] = useState("MANUAL_ENTRY");

  useEffect(() => {
    if (!lead) {
      setName("");
      setEmail("");
      setPhone("");
      setLocation("");
      setBudget("");
      setSource("MANUAL_ENTRY");
      return;
    }

    setName(lead.name || "");
    setEmail(lead.email || "");
    setPhone(lead.phone || "");
    setLocation(lead.interestedLocation || "");
    setBudget(lead.budget !== undefined ? String(lead.budget) : "");
    setSource(lead.source || "MANUAL_ENTRY");
  }, [lead]);

  const numericBudget = Math.max(0, Number(budget) || 0);
  const probability = Math.max(0, Math.min(100, Number(lead?.probability) || 10));
  const weighted = Math.round((numericBudget * probability) / 100);

  async function handleSave() {
    if (!name.trim()) return toast.error("Name required");
    if (!phone.trim()) return toast.error("Phone required");
    if (!location.trim()) return toast.error("Location required");

    setLoading(true);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim(),
        interestedLocation: location.trim(),
        budget: numericBudget,
        source,
      };

      const isRealEdit = Boolean(lead?._id && lead._id.trim().length > 0);

      const result = isRealEdit
        ? await apiFetch<LeadResponse>(`/api/leads/${lead!._id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<LeadResponse>("/api/leads", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      if (!result?.data) {
        toast.error("Save failed");
        return;
      }

      onUpdate(result.data);
      toast.success(isEdit ? "Lead updated" : "Lead created");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Server error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!lead?._id) return;
    if (!window.confirm(`Archive "${lead.name}"?`)) return;

    try {
      await apiFetch(`/api/leads/${lead._id}`, { method: "DELETE" });
      toast.success("Lead archived");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Archive failed");
    }
  }

  async function convertToDeal() {
    if (!lead) return;

    try {
      await apiFetch("/api/deals", {
        method: "POST",
        body: JSON.stringify({
          title: name,
          value: numericBudget,
          probability,
        }),
      });

      toast.success("Converted to deal");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Conversion failed");
    }
  }

  return (
    <DrawerShell
      open={Boolean(lead)}
      onClose={onClose}
      title={isEdit ? name || "Lead" : "New Lead"}
      subtitle="Lead Intelligence"
      icon={<UserCircle2 className="w-4 h-4 text-slate-600" />}
      footer={
        <div className="grid grid-cols-3 gap-2">
          <button className="flex items-center justify-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
            <Calendar size={14} />
            Demo
          </button>
          <button className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-white bg-black rounded-lg hover:bg-slate-800 active:scale-[0.98] transition-all">
            <Mail size={14} />
            Email
          </button>
          {isEdit && (
            <button
              onClick={handleDelete}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Archive
            </button>
          )}
        </div>
      }
    >
      <div className="px-6 py-6 space-y-6">

        {/* STATS */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Budget" value={money(numericBudget)} />
          <Stat label="Win %" value={`${probability}%`} />
          <Stat label="Expected" value={money(weighted)} highlight />
        </div>

        {/* FORM */}
        <div className="space-y-4">
          <SectionTitle>Lead Details</SectionTitle>

          <Input label="Name" value={name} onChange={setName} />
          <Input label="Email" value={email} onChange={setEmail} />
          <Input label="Phone" value={phone} onChange={setPhone} />
          <Input
            label="Interested Location"
            value={location}
            onChange={setLocation}
          />
          <Input
            label="Budget (₹)"
            value={budget}
            onChange={setBudget}
            type="number"
          />

          <div>
            <p className="text-xs text-slate-500 mb-1.5">Source</p>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-black/5"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-2.5 text-sm text-white bg-black rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Lead"}
          </button>
        </div>

        {/* CONVERT */}
        {isEdit && (
          <button
            onClick={convertToDeal}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all"
          >
            <ArrowRight size={14} />
            Convert to Deal
          </button>
        )}
      </div>
    </DrawerShell>
  );
}

/* ================= UI PRIMITIVES ================= */

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-xl border ${
        highlight
          ? "bg-emerald-50 border-emerald-200"
          : "bg-white border-slate-200"
      }`}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-400 mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-900 tabular-nums">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
      {children}
    </p>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-black/5"
      />
    </div>
  );
}