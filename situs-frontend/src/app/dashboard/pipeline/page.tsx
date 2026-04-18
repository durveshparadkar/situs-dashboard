"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCorners,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Plus } from "lucide-react";

/* ================= TYPES ================= */

type Stage = "Leads" | "Qualified" | "Proposal" | "Negotiation" | "Won";

type Deal = {
  _id: string;
  title?: string;
  value?: number;
  stage?: Stage;
  position?: number;
};

const stages: Stage[] = [
  "Leads",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
];

const isStage = (value: unknown): value is Stage =>
  typeof value === "string" && stages.includes(value as Stage);

/* ================= CARD ================= */

function DealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal._id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="
        bg-white border border-slate-200 rounded-xl p-3
        hover:shadow-md hover:-translate-y-[1px]
        transition cursor-grab active:cursor-grabbing
      "
    >
      <div className="text-sm font-semibold text-slate-800">
        {deal.title || "Untitled"}
      </div>

      <div className="text-xs text-slate-500 mt-1">
        ₹{Number(deal.value || 0).toLocaleString()}
      </div>
    </div>
  );
}

/* ================= COLUMN ================= */

function Column({ stage, deals }: { stage: Stage; deals: Deal[] }) {
  const total = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="w-[300px] min-w-[300px] flex-shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm">

      {/* HEADER */}
      <div className="px-4 py-3 border-b flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-700">
            {stage}
          </h2>

          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">
            {deals.length}
          </span>
        </div>

        <div className="text-xs text-slate-400">
          ₹{total.toLocaleString()}
        </div>
      </div>

      {/* CARDS */}
      <SortableContext
        items={deals.map((d) => d._id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="p-3 space-y-3 min-h-[140px]">
          {deals.length === 0 ? (
            <div className="text-xs text-center text-slate-400 py-10 border border-dashed rounded-lg">
              No deals yet
            </div>
          ) : (
            deals.map((deal) => (
              <DealCard key={deal._id} deal={deal} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

/* ================= MAIN ================= */

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    title: "",
    value: "",
    stage: "Leads" as Stage,
  });

  const sensors = useSensors(useSensor(PointerSensor));

  /* ================= FETCH ================= */

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/deals");
        const json = await res.json();

        if (!json?.success) {
          setDeals([]);
          return;
        }

        setDeals(json.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  /* ================= GROUP ================= */

  const groupedDeals = useMemo(() => {
    const map: Record<Stage, Deal[]> = {
      Leads: [],
      Qualified: [],
      Proposal: [],
      Negotiation: [],
      Won: [],
    };

    deals.forEach((d) => {
      const stage = isStage(d.stage) ? d.stage : "Leads";
      map[stage].push(d);
    });

    stages.forEach((s) =>
      map[s].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    );

    return map;
  }, [deals]);

  /* ================= DRAG ================= */

  const handleDragStart = (e: DragStartEvent) => {
    const deal = deals.find((d) => d._id === e.active.id);
    if (deal) setActiveDeal(deal);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDeal(null);
    if (!over) return;

    const id = String(active.id);

    let stage: Stage | null = null;

    if (isStage(over.id)) stage = over.id;
    else {
      const target = deals.find((d) => d._id === over.id);
      if (isStage(target?.stage)) stage = target.stage;
    }

    if (!stage) return;

    const position = over.data?.current?.sortable?.index ?? 0;

    const prev = [...deals];

    setDeals((p) =>
      p.map((d) =>
        d._id === id ? { ...d, stage, position } : d
      )
    );

    try {
      await fetch(`/api/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, position }),
      });
    } catch {
      setDeals(prev);
    }
  };

  /* ================= CREATE ================= */

  const handleCreate = async () => {
    setErrorMsg("");

    if (!form.title.trim()) {
      setErrorMsg("Title is required");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          value: Number(form.value) || 0,
          stage: form.stage,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setErrorMsg(json.message || "Failed");
        return;
      }

      setDeals((p) => [...p, json.data]);
      setOpen(false);
      setForm({ title: "", value: "", stage: "Leads" });
    } catch (err) {
      console.error("CREATE DEAL ERROR:", err);

      const message =
        err instanceof Error ? err.message : "Network error";

      setErrorMsg(message);
    } finally {
      setCreating(false);
    }
  };

  /* ================= UI ================= */

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-400">
        Loading pipeline...
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div>

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-2 hover:bg-slate-100 rounded-lg">
              <ArrowLeft size={18} />
            </Link>

            <h1 className="text-lg font-semibold text-slate-800">
              Pipeline
            </h1>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 bg-black text-white px-3 py-1.5 rounded-lg text-sm hover:scale-[1.03] active:scale-95 transition"
          >
            <Plus size={14} />
            Add Deal
          </button>
        </div>

        {/* BOARD */}
        <div className="flex gap-6 overflow-x-auto pb-4 min-h-[500px]">
          {stages.map((s) => (
            <Column key={s} stage={s} deals={groupedDeals[s]} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeDeal && <DealCard deal={activeDeal} />}
      </DragOverlay>

      {/* MODAL */}
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-xl space-y-4">

            <h2 className="text-sm font-semibold text-slate-800">
              Create Deal
            </h2>

            {errorMsg && (
              <div className="text-xs text-red-500">
                {errorMsg}
              </div>
            )}

            <input
              placeholder="Deal title"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
              className="w-full border border-slate-200 p-2 rounded-lg text-sm"
            />

            <input
              placeholder="Value"
              type="number"
              value={form.value}
              onChange={(e) =>
                setForm({ ...form, value: e.target.value })
              }
              className="w-full border border-slate-200 p-2 rounded-lg text-sm"
            />

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full bg-black text-white py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Deal"}
            </button>
          </div>
        </div>
      )}
    </DndContext>
  );
}
