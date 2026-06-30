"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import MetricCard from "../../../components/dashboard/metric-card";
import DealDrawer from "../../../components/drawers/deal-drawer";

import { apiFetch } from "@/lib/api";

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">{children}</div>
);

const Card = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: "easeOut" }}
    className={`rounded-2xl border border-slate-200 bg-white shadow-sm p-4 ${className}`}
  >
    {children}
  </motion.div>
);

/* ================= TYPES ================= */

type Stage = "Leads" | "Qualified" | "Proposal" | "Negotiation" | "Won";

type Deal = {
  _id: string;
  title?: string;
  value?: number;
  stage?: Stage;          // visual column (derived from backend stageId)
  stageId?: string;       // backend stage ObjectId (source of truth)
  position?: number;
};

type DrawerDeal = Deal & {
  name: string;
  riskScore: number;
};

type BackendStage = {
  _id: string;
  name: string;
  order: number;
};

type BackendPipeline = {
  _id: string;
  name: string;
  stages: BackendStage[];
};

/* ================= CONSTANTS ================= */

const stages: Stage[] = [
  "Leads",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
];

/* Subtle accent color per column — purely visual, doesn't touch logic */
const stageAccent: Record<Stage, string> = {
  Leads: "bg-slate-400",
  Qualified: "bg-blue-400",
  Proposal: "bg-amber-400",
  Negotiation: "bg-purple-400",
  Won: "bg-emerald-500",
};

const isStage = (v: unknown): v is Stage =>
  typeof v === "string" && stages.includes(v as Stage);

/* Map backend stage NAME → visual column.
   Backend pipeline uses: DISCOVERY, QUALIFICATION, PROPOSAL_SENT,
   NEGOTIATION, VERBAL_COMMIT, CONTRACT_SENT, WON, LOST. We fold the
   later-funnel stages into "Negotiation" so the 5-column UI is preserved. */
function backendStageNameToColumn(name: string): Stage {
  const n = name.toUpperCase();
  if (n === "DISCOVERY") return "Leads";
  if (n === "QUALIFICATION") return "Qualified";
  if (n === "PROPOSAL_SENT" || n === "PROPOSAL") return "Proposal";
  if (n === "NEGOTIATION" || n === "VERBAL_COMMIT" || n === "CONTRACT_SENT")
    return "Negotiation";
  if (n === "WON") return "Won";
  /* LOST and anything unknown default to Leads so deals never disappear */
  return "Leads";
}

/* ================= AI ================= */

function calculateAI(deal: Deal) {
  const weights: Record<Stage, number> = {
    Leads: 0.2,
    Qualified: 0.4,
    Proposal: 0.6,
    Negotiation: 0.8,
    Won: 1,
  };

  const stage = deal.stage ?? "Leads";

  let probability =
    weights[stage] * 100 +
    Math.min((deal.value ?? 0) / 500000, 25) -
    (deal.position ?? 0) * 2;

  probability = Math.max(5, Math.min(100, probability));

  return {
    probability,
    risk: 100 - probability,
  };
}

/* ================= DEAL CARD ================= */

function DealCard({
  deal,
  onClick,
  dragOverlay = false,
}: {
  deal: Deal;
  onClick?: () => void;
  dragOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: deal._id,
    disabled: dragOverlay,
  });

  const { probability } = calculateAI(deal);

  return (
    <motion.div
      ref={dragOverlay ? undefined : setNodeRef}
      {...(dragOverlay ? {} : attributes)}
      {...(dragOverlay ? {} : listeners)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition: transition || "transform 200ms ease",
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-grab active:cursor-grabbing ${
        dragOverlay ? "shadow-lg rotate-1" : ""
      }`}
    >
      <p className="text-sm font-semibold text-slate-900 truncate">
        {deal.title || "Untitled"}
      </p>

      <p className="text-xs text-slate-500 mt-1 tabular-nums">
        ₹{Number(deal.value ?? 0).toLocaleString()}
      </p>

      <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-black rounded-full transition-all"
          style={{ width: `${probability}%` }}
        />
      </div>
    </motion.div>
  );
}

/* ================= COLUMN ================= */

function Column({
  stage,
  deals,
  onSelect,
}: {
  stage: Stage;
  deals: Deal[];
  onSelect: (d: Deal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div className="w-[300px] shrink-0">
      <Card
        className={`transition-all duration-150 ${
          isOver ? "ring-2 ring-black/10 bg-slate-50 border-slate-300" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${stageAccent[stage]}`} />
            <p className="text-sm font-semibold text-slate-900">{stage}</p>
          </div>
          <span className="text-xs bg-slate-900 text-white px-2 py-0.5 rounded-full tabular-nums">
            {deals.length}
          </span>
        </div>

        <SortableContext
          items={deals.map((d) => d._id)}
          strategy={verticalListSortingStrategy}
        >
          <div ref={setNodeRef} className="space-y-3 min-h-[200px]">
            {deals.length === 0 ? (
              <div className="text-xs text-center text-slate-400 py-10 border border-dashed border-slate-200 rounded-lg">
                No deals yet
              </div>
            ) : (
              deals.map((d) => (
                <DealCard
                  key={d._id}
                  deal={d}
                  onClick={() => onSelect(d)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </Card>
    </div>
  );
}

/* ================= PAGE ================= */

export default function PipelinePage() {
  const router = useRouter();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  /* Map of visual column → backend stage ObjectId, built from the
     default pipeline. Used when a drag needs to PATCH a deal's stageId. */
  const [columnToStageId, setColumnToStageId] = useState<Record<Stage, string>>(
    {} as Record<Stage, string>
  );

  /* Map of backend stageId → visual column, for grouping loaded deals. */
 const [, setStageIdToColumn] = useState<Record<string, Stage>>(
  {}
);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        setLoading(true);

        /* 1. Fetch the default pipeline to learn real stages + their IDs */
        const idToCol: Record<string, Stage> = {};
const colToId: Record<Stage, string> = {} as Record<Stage, string>;

        try {
          const pipeRes = await apiFetch<{ success: boolean; data: BackendPipeline }>(
            "/api/pipelines/default"
          );
          const pipeline = pipeRes?.data;
          if (pipeline?.stages?.length) {
            for (const st of pipeline.stages) {
              const col = backendStageNameToColumn(st.name);
              idToCol[st._id] = col;
              /* First stageId we see for a column wins as the drop target */
              if (!colToId[col]) colToId[col] = st._id;
            }
          }
        } catch {
          /* No pipeline? Leave maps empty — deals fall back to Leads column */
        }

        if (!ignore) {
          setStageIdToColumn(idToCol);
          setColumnToStageId(colToId);
        }

        /* 2. Fetch deals from the backend */
        const dealRes = await apiFetch<{ success: boolean; data: Deal[] }>(
          "/api/deals?limit=100"
        );

        const raw = Array.isArray(dealRes?.data) ? dealRes.data : [];

        /* 3. Derive each deal's visual column from its backend stageId */
        const mapped: Deal[] = raw.map((d) => {
          const sid = (d as { stageId?: string }).stageId
            ? String((d as { stageId?: string }).stageId)
            : undefined;
          const col: Stage = sid && idToCol[sid] ? idToCol[sid] : "Leads";
          return {
            ...d,
            stageId: sid,
            stage: col,
          };
        });

        if (!ignore) setDeals(mapped);
      } catch (err) {
        console.error("Failed to fetch pipeline data", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map: Record<Stage, Deal[]> = {
      Leads: [],
      Qualified: [],
      Proposal: [],
      Negotiation: [],
      Won: [],
    };

    deals.forEach((d) => {
      const s = isStage(d.stage) ? d.stage : "Leads";
      map[s].push(d);
    });

    stages.forEach((s) =>
      map[s].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    );

    return map;
  }, [deals]);

  const pipelineValue = deals.reduce((s, d) => s + (d.value || 0), 0);

  const dealsAtRisk = deals.filter(
    (d) => calculateAI(d).risk >= 70
  ).length;

  const handleDragStart = (e: DragStartEvent) => {
    const deal = deals.find((d) => d._id === String(e.active.id));
    if (deal) setActiveDeal(deal);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDeal(null);

    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const current = deals.find((d) => d._id === activeId);
    if (!current) return;

    let newStage: Stage = current.stage ?? "Leads";
    if (isStage(overId)) newStage = overId;

    /* Optimistic UI update — move the card immediately */
    const updated = deals.map((d) =>
      d._id === activeId ? { ...d, stage: newStage } : d
    );
    setDeals(updated);

    /* Resolve the backend stageId for the target column. If we don't
       have one (no pipeline loaded), skip the PATCH — UI still moved. */
    const targetStageId = columnToStageId[newStage];
    if (!targetStageId) return;

    try {
      await apiFetch(`/api/deals/${activeId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: targetStageId }),
      });
    } catch (err) {
      console.error("Stage update failed", err);
    }
  };

  const drawerDeal: DrawerDeal | null = selectedDeal
    ? {
        ...selectedDeal,
        name: selectedDeal.title || "Untitled",
        riskScore: calculateAI(selectedDeal).risk,
      }
    : null;

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-16 bg-slate-200 rounded-md" />
          <div className="h-7 w-40 bg-slate-200 rounded-md" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-slate-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
        <div className="flex gap-6 overflow-x-auto pb-2">
          {stages.map((s) => (
            <div
              key={s}
              className="w-[300px] shrink-0 h-72 bg-slate-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <PageContainer>

          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-2"
            >
              <ArrowLeft size={16} /> Back
            </button>

            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Pipeline
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Drag deals between stages to update their progress
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Card><MetricCard title="Deals" value={deals.length.toString()} /></Card>
            <Card><MetricCard title="Pipeline Value" value={`₹${pipelineValue.toLocaleString()}`} /></Card>
            <Card><MetricCard title="At Risk" value={dealsAtRisk.toString()} /></Card>
          </div>

          <div className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1">
            {stages.map((s) => (
              <Column
                key={s}
                stage={s}
                deals={grouped[s]}
                onSelect={setSelectedDeal}
              />
            ))}
          </div>

        </PageContainer>

        <DragOverlay>
          {activeDeal && <DealCard deal={activeDeal} dragOverlay />}
        </DragOverlay>
      </DndContext>

      <DealDrawer
        deal={drawerDeal}
        onClose={() => setSelectedDeal(null)}
        onUpdate={() => setSelectedDeal(null)}
      />
    </>
  );
}