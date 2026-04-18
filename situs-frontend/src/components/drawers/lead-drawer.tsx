"use client";

import { useEffect, useState } from "react";
import { UserCircle2, Mail, Calendar, Sparkles, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import DrawerShell from "./shared/drawer-shell";

/* ================= TYPES ================= */

interface Lead {
  _id?: string;
  name: string;
  email?: string;
  company: string;
  value?: number;
  status?: "new" | "contacted" | "qualified" | "converted";
  createdAt?: string;
}

interface LeadDrawerProps {
  lead: Lead | null;
  onClose: () => void;
}

/* ================= HELPERS ================= */

function getProbabilityFromStatus(status?: string) {
  if (status === "new") return 30;
  if (status === "contacted") return 50;
  if (status === "qualified") return 70;
  if (status === "converted") return 100;
  return 40;
}

function statusTone(status?: Lead["status"]) {
  if (status === "converted")
    return "text-emerald-700 bg-emerald-50 ring-emerald-200/60";
  if (status === "qualified")
    return "text-emerald-700 bg-emerald-50 ring-emerald-200/60";
  if (status === "contacted")
    return "text-amber-700 bg-amber-50 ring-amber-200/60";
  return "text-zinc-600 bg-zinc-100 ring-zinc-200/60";
}

/* ================= COMPONENT ================= */

export default function LeadDrawer({ lead, onClose }: LeadDrawerProps) {
  const [composer, setComposer] = useState<null | "email" | "meeting">(null);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");

  const [status, setStatus] = useState<Lead["status"]>("new");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  /* Sync status when lead changes */
  useEffect(
    function () {
      if (lead && lead.status) setStatus(lead.status);
      else setStatus("new");
      setComposer(null);
      setEmailMessage("");
      setMeetingDate("");
      setMeetingTime("");
    },
    [lead]
  );

  const probability = getProbabilityFromStatus(status);
  const value = lead && lead.value ? lead.value : 0;
  const weighted = Math.round((value * probability) / 100);

  /* ================= HANDLERS ================= */

  async function updateStatus() {
    if (!lead || !lead._id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead._id, status }),
      });
      if (res.ok) toast.success("Status updated");
      else toast.error("Update failed");
    } catch (err) {
      console.error(err);
      toast.error("Server error");
    } finally {
      setSaving(false);
    }
  }

  async function generateEmail() {
    if (!lead) return;
    setEmailLoading(true);
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: lead.name, company: lead.company }),
      });
      const data = await res.json();
      setEmailMessage(data.email || "");
    } catch (err) {
      console.error(err);
      toast.error("Could not generate email");
    } finally {
      setEmailLoading(false);
    }
  }

  async function sendEmail() {
    if (!lead) return;
    try {
      const recipient = lead.email
        ? lead.email
        : lead.name + "@example.com";
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject: "Follow up from our conversation",
          message: emailMessage,
        }),
      });
      if (res.ok) {
        toast.success("Email sent");
        setComposer(null);
      } else {
        toast.error("Email failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Server error");
    }
  }

  async function scheduleMeeting() {
    try {
      const res = await fetch("/api/schedule-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, date: meetingDate, time: meetingTime }),
      });
      if (res.ok) {
        toast.success("Meeting scheduled");
        setComposer(null);
      } else {
        toast.error("Schedule failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Server error");
    }
  }

  async function convertToDeal() {
    if (!lead) return;
    setConverting(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lead.name,
          value: lead.value || 0,
          probability: getProbabilityFromStatus(status),
          owner: "You",
        }),
      });
      if (res.ok) {
        toast.success("Lead converted to deal");
        onClose();
      } else {
        toast.error("Conversion failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Server error");
    } finally {
      setConverting(false);
    }
  }

  /* ================= UI ================= */

  const open = lead !== null;

  const footer = (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={convertToDeal}
        disabled={converting}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
      >
        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        {converting ? "Converting..." : "Convert to Deal"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={function () {
            setComposer("meeting");
          }}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-black/[0.08] rounded-lg hover:bg-zinc-50 hover:border-black/[0.14] transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" strokeWidth={2} />
          Schedule Demo
        </button>
        <button
          type="button"
          onClick={function () {
            setComposer("email");
          }}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-black/[0.08] rounded-lg hover:bg-zinc-50 hover:border-black/[0.14] transition-colors"
        >
          <Mail className="w-3.5 h-3.5" strokeWidth={2} />
          Send Email
        </button>
      </div>
    </div>
  );

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={lead ? lead.name : ""}
      subtitle="Lead Intelligence"
      icon={<UserCircle2 className="w-4 h-4 text-zinc-700" strokeWidth={1.75} />}
      footer={footer}
    >
      {lead && (
        <div className="px-6 py-6 space-y-6">
          {/* Company + status chip */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400 mb-0.5">
                Company
              </div>
              <div className="text-[14px] font-medium text-zinc-900 truncate">
                {lead.company || "—"}
              </div>
            </div>
            <span
              className={
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset capitalize " +
                statusTone(status)
              }
            >
              {status}
            </span>
          </div>

          {/* STAT TRIO */}
          <section className="grid grid-cols-3 gap-2">
            <StatCard label="Value" value={"₹" + value.toLocaleString()} />
            <StatCard label="Probability" value={probability + "%"} />
            <StatCard
              label="Weighted"
              value={"₹" + weighted.toLocaleString()}
              tone="emerald"
            />
          </section>

          {/* STATUS EDITOR */}
          <section className="space-y-3">
            <SectionLabel>Update status</SectionLabel>

            <Field label="Status">
              <select
                value={status}
                onChange={function (e) {
                  setStatus(e.target.value as Lead["status"]);
                }}
                className="w-full px-3 py-2 text-[13px] text-zinc-900 bg-white border border-black/[0.08] rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/40 transition-colors"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted</option>
              </select>
            </Field>

            <button
              type="button"
              onClick={updateStatus}
              disabled={saving}
              className="w-full px-3 py-2 text-[13px] font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Status"}
            </button>
          </section>

          {/* EMAIL COMPOSER */}
          {composer === "email" && (
            <section className="space-y-3 rounded-xl border border-black/[0.06] bg-zinc-50/50 p-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Email composer</SectionLabel>
                <button
                  type="button"
                  onClick={generateEmail}
                  disabled={emailLoading}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-700 hover:text-emerald-800 transition-colors disabled:opacity-60"
                >
                  <Sparkles className="w-3 h-3" strokeWidth={2.25} />
                  {emailLoading ? "Generating..." : "Generate with AI"}
                </button>
              </div>

              <textarea
                value={emailMessage}
                onChange={function (e) {
                  setEmailMessage(e.target.value);
                }}
                placeholder="Write or generate an email..."
                className="w-full h-32 px-3 py-2 text-[13px] text-zinc-900 bg-white border border-black/[0.08] rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/40 transition-colors resize-none leading-relaxed"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={function () {
                    setComposer(null);
                  }}
                  className="px-3 py-1.5 text-[12px] font-medium text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={sendEmail}
                  disabled={!emailMessage.trim()}
                  className="px-3 py-1.5 text-[12px] font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </section>
          )}

          {/* MEETING COMPOSER */}
          {composer === "meeting" && (
            <section className="space-y-3 rounded-xl border border-black/[0.06] bg-zinc-50/50 p-4">
              <SectionLabel>Schedule demo</SectionLabel>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Date">
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={function (e) {
                      setMeetingDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 text-[13px] text-zinc-900 bg-white border border-black/[0.08] rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/40 transition-colors"
                  />
                </Field>
                <Field label="Time">
                  <input
                    type="time"
                    value={meetingTime}
                    onChange={function (e) {
                      setMeetingTime(e.target.value);
                    }}
                    className="w-full px-3 py-2 text-[13px] text-zinc-900 bg-white border border-black/[0.08] rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/40 transition-colors"
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={function () {
                    setComposer(null);
                  }}
                  className="px-3 py-1.5 text-[12px] font-medium text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={scheduleMeeting}
                  disabled={!meetingDate || !meetingTime}
                  className="px-3 py-1.5 text-[12px] font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </DrawerShell>
  );
}

/* ================= INLINE PRIMITIVES ================= */

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-[16px] font-semibold tabular-nums text-emerald-700"
      : "text-[16px] font-semibold tabular-nums text-zinc-900";
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-400 mb-1">
        {label}
      </div>
      <div className={valueClass}>{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-500 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-500">
      {children}
    </div>
  );
}