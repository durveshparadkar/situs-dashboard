"use client";

import { useEffect, useState } from "react";
import { Building2, Mail, Calendar, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import DrawerShell from "./shared/drawer-shell";

/* ================= TYPES ================= */

interface Deal {
  _id?: string;
  name: string;
  value?: number;
  riskScore: number;
}

interface Props {
  deal: Deal | null;
  onClose: () => void;
  onUpdate: (deal: Deal) => void;
}

/* ================= COMPONENT ================= */

export default function DealDrawer({ deal, onClose, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("");

  const [composer, setComposer] = useState<null | "email" | "meeting">(null);

  const [emailMessage, setEmailMessage] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");

  /* Sync fields when deal changes */
  useEffect(
    function () {
      if (!deal) return;
      setTitle(deal.name || "");
      setValue(deal.value !== undefined ? String(deal.value) : "");
      setProbability(String(100 - deal.riskScore));
      setComposer(null);
      setEmailMessage("");
      setMeetingDate("");
      setMeetingTime("");
    },
    [deal]
  );

  /* Derived calculations */
  const prob = Math.min(100, Math.max(0, Number(probability) || 0));
  const val = Math.max(0, Number(value) || 0);
  const weighted = Math.round((val * prob) / 100);

  /* ================= HANDLERS ================= */

  async function handleSave() {
    if (!deal) return;
    if (!deal._id) {
      toast.error("Missing deal ID");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/deals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deal._id,
          title,
          value: val,
          probability: prob,
        }),
      });
      const result = await res.json();
      const updated = result && result.data ? result.data : null;

      if (!res.ok || !updated) {
        toast.error("Update failed");
        return;
      }

      onUpdate({
        _id: updated._id || deal._id,
        name: updated.title || title,
        value: updated.value !== undefined ? updated.value : val,
        riskScore:
          typeof updated.probability === "number"
            ? 100 - updated.probability
            : 100 - prob,
      });

      toast.success("Deal updated");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Server error");
    } finally {
      setLoading(false);
    }
  }

  async function generateEmail() {
    if (!deal) return;
    setEmailLoading(true);
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deal.name }),
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
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "Follow up", message: emailMessage }),
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
        body: JSON.stringify({ deal, date: meetingDate, time: meetingTime }),
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

  /* ================= UI ================= */

  const open = deal !== null;

  const footer = (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={function () {
          setComposer("meeting");
        }}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-black/[0.08] rounded-lg hover:bg-zinc-50 hover:border-black/[0.14] transition-colors"
      >
        <Calendar className="w-3.5 h-3.5" strokeWidth={2} />
        Schedule
      </button>
      <button
        type="button"
        onClick={function () {
          setComposer("email");
        }}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors"
      >
        <Mail className="w-3.5 h-3.5" strokeWidth={2} />
        Send Email
      </button>
    </div>
  );

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={deal ? deal.name : ""}
      subtitle="Deal Intelligence"
      icon={<Building2 className="w-4 h-4 text-zinc-700" strokeWidth={1.75} />}
      footer={footer}
    >
      {deal && (
        <div className="px-6 py-6 space-y-6">
          {/* STAT TRIO */}
          <section className="grid grid-cols-3 gap-2">
            <StatCard label="Value" value={"₹" + val.toLocaleString()} />
            <StatCard label="Probability" value={prob + "%"} />
            <StatCard
              label="Weighted"
              value={"₹" + weighted.toLocaleString()}
              tone="emerald"
            />
          </section>

          {/* FORM */}
          <section className="space-y-3">
            <SectionLabel>Deal details</SectionLabel>

            <Field label="Title">
              <input
                value={title}
                onChange={function (e) {
                  setTitle(e.target.value);
                }}
                className="w-full px-3 py-2 text-[13px] text-zinc-900 bg-white border border-black/[0.08] rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/40 transition-colors"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Value (₹)">
                <input
                  type="number"
                  value={value}
                  onChange={function (e) {
                    setValue(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-[13px] text-zinc-900 bg-white border border-black/[0.08] rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/40 transition-colors tabular-nums"
                />
              </Field>

              <Field label="Probability (%)">
                <input
                  type="number"
                  value={probability}
                  onChange={function (e) {
                    setProbability(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-[13px] text-zinc-900 bg-white border border-black/[0.08] rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/40 transition-colors tabular-nums"
                />
              </Field>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="w-full mt-2 px-3 py-2 text-[13px] font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save Changes"}
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
              <SectionLabel>Schedule meeting</SectionLabel>

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