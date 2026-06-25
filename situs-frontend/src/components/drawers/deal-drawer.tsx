"use client";

import { useEffect, useState } from "react";
import { Building2, Mail, Calendar, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import DrawerShell from "./shared/drawer-shell";
import { apiFetch } from "@/lib/api";

import {
  createDeal,
  updateDeal,
  getDefaultPipeline,
  type BackendDeal,
  type BackendPipeline,
} from "../../lib/intelligence/deals.api";

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
  onUpdate: (deal: BackendDeal) => void;
}

/* ================= COMPONENT ================= */

export default function DealDrawer({ deal, onClose, onUpdate }: Props) {
  const isEdit = Boolean(deal?._id);

  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("");

  const [pipeline, setPipeline] = useState<BackendPipeline | null>(null);
  const [stageId, setStageId] = useState("");
  const [pipelineLoading, setPipelineLoading] = useState(true);

  const [composer, setComposer] = useState<"email" | "meeting" | null>(null);

  const [emailMessage, setEmailMessage] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");

  /* ================= LOAD PIPELINE (once) ================= */

  useEffect(() => {
    const loadPipeline = async () => {
      try {
        const p = await getDefaultPipeline();
        setPipeline(p);
        if (p?.stages?.length) {
          setStageId(p.stages[0]._id);
        }
      } catch (err) {
        console.error("Failed to load pipeline:", err);
      } finally {
        setPipelineLoading(false);
      }
    };
    loadPipeline();
  }, []);

  /* ================= SYNC ================= */

  useEffect(() => {
    if (!deal) {
      setTitle("");
      setValue("");
      setProbability("");
      return;
    }

    setTitle(deal.name || "");
    setValue(deal.value ? String(deal.value) : "");
    setProbability(String(100 - deal.riskScore));

    setComposer(null);
    setEmailMessage("");
    setMeetingDate("");
    setMeetingTime("");
  }, [deal]);

  /* ================= DERIVED ================= */

  const prob = Math.min(100, Math.max(0, Number(probability) || 0));
  const val = Math.max(0, Number(value) || 0);
  const weighted = Math.round((val * prob) / 100);

  function handleStageChange(id: string) {
    setStageId(id);
    const stage = pipeline?.stages.find((s) => s._id === id);
    if (stage && typeof stage.probability === "number") {
      setProbability(String(stage.probability));
    }
  }

  /**
   * Maps the selected stage's isWon/isLost flags to the deal's status
   * field. Moving a deal into a "won" or "lost" stage in the dropdown
   * doesn't automatically flip status on the backend — that's a
   * separate field the model uses for revenue/forecast aggregations.
   * Without this, deals visually sit in "Won" but never count as
   * closed revenue (analytics revenue trend stays empty).
   */
  function resolveStatus(): "won" | "lost" | undefined {
    const stage = pipeline?.stages.find((s) => s._id === stageId);
    if (!stage) return undefined;
    if (stage.isWon) return "won";
    if (stage.isLost) return "lost";
    return undefined;
  }

  /* ================= SAVE =================
     Routes through backend deals API:
     - Create: POST /api/deals (now passes pipelineId + stageId + status)
     - Update: PATCH /api/deals/:id */

  async function handleSave() {
    if (!title.trim()) return toast.error("Title required");

    setLoading(true);

    const status = resolveStatus();

    try {
      if (isEdit && deal?._id) {
        const updated = await updateDeal(deal._id, {
          title,
          value: val,
          probability: prob,
          ...(stageId && { stageId }),
          ...(status && { status }),
        });

        onUpdate(updated);

        toast.success("Deal updated");
      } else {
        const created = await createDeal({
          title,
          value:       val,
          probability: prob,
          ...(pipeline?._id && { pipelineId: pipeline._id }),
          ...(stageId && { stageId }),
        });

        onUpdate(created);

        toast.success("Deal created");
      }

      onClose();
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Save failed"
      );
    } finally {
      setLoading(false);
    }
  }

  /* ================= EMAIL ================= */

  async function generateEmail() {
    setEmailLoading(true);
    try {
      const data = await apiFetch<{ email?: string }>("/api/generate-email", {
        method: "POST",
        body: JSON.stringify({ name: title }),
      });

      setEmailMessage(data?.email || "");
    } catch {
      toast.error("Failed to generate email");
    } finally {
      setEmailLoading(false);
    }
  }

  async function sendEmail() {
    try {
      await apiFetch("/api/send-email", {
        method: "POST",
        body: JSON.stringify({ message: emailMessage }),
      });

      toast.success("Email sent");
      setComposer(null);
    } catch {
      toast.error("Failed to send email");
    }
  }

  /* ================= MEETING ================= */

  async function scheduleMeeting() {
    if (!meetingDate || !meetingTime) {
      toast.error("Select date & time");
      return;
    }

    try {
      await apiFetch("/api/schedule-meeting", {
        method: "POST",
        body: JSON.stringify({ date: meetingDate, time: meetingTime }),
      });

      toast.success("Meeting scheduled");
      setComposer(null);
    } catch {
      toast.error("Failed to schedule");
    }
  }

  /* ================= UI ================= */

  return (
    <DrawerShell
      open={Boolean(deal)}
      onClose={onClose}
      title={isEdit ? title || "Deal" : "New Deal"}
      subtitle="Deal Intelligence"
      icon={<Building2 className="w-4 h-4 text-slate-700" />}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setComposer("meeting")}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <Calendar size={14} />
            Schedule
          </button>

          <button
            onClick={() => setComposer("email")}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-white bg-black rounded-lg hover:bg-slate-800"
          >
            <Mail size={14} />
            Email
          </button>
        </div>
      }
    >
      <div className="px-6 py-6 space-y-6">

        {/* STATS */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Value" value={`₹${val.toLocaleString()}`} />
          <Stat label="Win %" value={`${prob}%`} />
          <Stat
            label="Expected"
            value={`₹${weighted.toLocaleString()}`}
            highlight
          />
        </div>

        {/* FORM */}
        <div className="space-y-4">
          <SectionTitle>Deal Details</SectionTitle>

          <Input label="Title" value={title} onChange={setTitle} />

          <div>
            <p className="text-xs text-slate-500 mb-1">Stage</p>
            <select
              value={stageId}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={pipelineLoading || !pipeline}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-black/10"
            >
              {pipelineLoading && <option>Loading stages…</option>}
              {!pipelineLoading && !pipeline && <option>No pipeline found</option>}
              {pipeline?.stages.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Value" type="number" value={value} onChange={setValue} />
            <Input label="Probability" type="number" value={probability} onChange={setProbability} />
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-2.5 text-sm text-white bg-black rounded-xl hover:bg-slate-800"
          >
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Deal"}
          </button>
        </div>

        {/* EMAIL */}
        {composer === "email" && (
          <Card>
            <div className="flex justify-between mb-2">
              <SectionTitle>Email</SectionTitle>

              <button
                onClick={generateEmail}
                className="text-emerald-600 text-xs flex items-center gap-1"
              >
                <Sparkles size={12} />
                {emailLoading ? "..." : "AI"}
              </button>
            </div>

            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              className="w-full h-28 border rounded-lg p-2 text-sm"
            />

            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setComposer(null)} className="px-3 py-1 text-sm border rounded">
                Cancel
              </button>
              <button onClick={sendEmail} className="px-3 py-1 text-sm bg-black text-white rounded">
                Send
              </button>
            </div>
          </Card>
        )}

        {/* MEETING */}
        {composer === "meeting" && (
          <Card>
            <SectionTitle>Meeting</SectionTitle>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end mt-3">
              <button
                onClick={scheduleMeeting}
                className="px-3 py-1 text-sm bg-black text-white rounded"
              >
                Confirm
              </button>
            </div>
          </Card>
        )}
      </div>
    </DrawerShell>
  );
}

/* ================= UI ================= */

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border ${
      highlight ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"
    }`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase text-slate-400">{children}</p>;
}

function Input({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-black/10"
      />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 border rounded-xl bg-slate-50">
      {children}
    </div>
  );
}