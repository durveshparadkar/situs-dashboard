"use client";

import { useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion as m } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Plus,
  Upload,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

import MetricCard from "../../../components/dashboard/metric-card";
import DealDrawer from "../../../components/drawers/deal-drawer";

import { apiFetch } from "@/lib/api";
import { formatCurrency, useOrgCurrency, OrgCurrency } from "@/lib/currency";

import {
  listDeals,
  importDeals,
  parseDealsFile,
  buildImportTemplate,
  deleteDeal,
  type BackendDeal,
  type ImportResult,
} from "../../../lib/intelligence/deals.api";

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-zinc-50/40">
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {children}
    </div>
  </div>
);

/* Same Card language as every other page */
const Card = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <m.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: "easeOut" }}
    className={`rounded-2xl border border-zinc-100 bg-white transition-all duration-200 hover:border-zinc-200 hover:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] p-5 ${className}`}
  >
    {children}
  </m.div>
);

/* ================= CURRENCY SYMBOL HELPER (for short UI labels) ================= */

const CURRENCY_SYMBOL_MAP: Record<OrgCurrency, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/* ================= TYPES ================= */

type DealStatus = "open" | "won" | "lost" | "stalled" | "abandoned";

type RankedDeal = {
  _id: string;
  name: string;
  value: number;
  probability: number;
  riskScore: number;
  lastActivityDays: number;
  status: DealStatus;
  stageName: string;
};

/* ================= STAGE HELPERS ================= */

function friendlyStageName(raw: string): string {
  const map: Record<string, string> = {
    DISCOVERY:       "Discovery",
    QUALIFICATION:   "Qualified",
    PROPOSAL_SENT:   "Proposal",
    PROPOSAL:        "Proposal",
    NEGOTIATION:     "Negotiation",
    VERBAL_COMMIT:   "Verbal",
    CONTRACT_SENT:   "Contract",
    WON:             "Won",
    LOST:            "Lost",
  };
  return map[raw.toUpperCase()] ?? raw;
}

/* Stage pill color — signals funnel position at a glance */
function getStagePill(name: string): string {
  const n = name.toLowerCase();
  if (n === "won")                                          return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (n === "lost")                                         return "bg-zinc-100 text-zinc-500 border-zinc-200";
  if (n === "negotiation" || n === "verbal" || n === "contract") return "bg-amber-50 text-amber-700 border-amber-200";
  if (n === "proposal")                                     return "bg-blue-50 text-blue-700 border-blue-200";
  if (n === "qualified")                                    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-zinc-50 text-zinc-600 border-zinc-200";
}

/* ================= OTHER HELPERS ================= */

function getMomentum(days: number) {
  if (days >= 10)
    return { icon: ArrowDownRight, color: "text-red-600", label: "Falling" };
  if (days >= 6)
    return { icon: ArrowRight, color: "text-zinc-500", label: "Stable" };
  return { icon: ArrowUpRight, color: "text-emerald-600", label: "Improving" };
}

function getRiskColor(score: number) {
  if (score >= 70) return "text-red-600";
  if (score >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function getLastActivityDays(deal: BackendDeal): number {
  if (!deal.lastActivityAt) return 0;
  const last = new Date(deal.lastActivityAt).getTime();
  return Math.max(0, Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24)));
}

function mapBackendDealToRanked(
  d: BackendDeal,
  stageMap: Record<string, string>
): RankedDeal {
  const rawStatus = (d as unknown as { status?: string }).status;
  const status: DealStatus =
    rawStatus === "won" || rawStatus === "lost" ||
    rawStatus === "stalled" || rawStatus === "abandoned"
      ? rawStatus : "open";

  const stageId = (d as unknown as { stageId?: string }).stageId ?? "";
  const rawStageName = stageMap[stageId] ?? "";
  const stageName = rawStageName
    ? friendlyStageName(rawStageName)
    : status === "won" ? "Won" : status === "lost" ? "Lost" : "—";

  return {
    _id:              d._id,
    name:             d.title,
    value:            d.value,
    probability:      d.probability ?? 0,
    riskScore:        d.riskScore ?? 0,
    lastActivityDays: getLastActivityDays(d),
    status,
    stageName,
  };
}

/* ================= PAGE ================= */

export default function DealsPage() {
  const router = useRouter();
  const currency = useOrgCurrency();
  const currencySymbol = CURRENCY_SYMBOL_MAP[currency];

  const [deals, setDeals] = useState<BackendDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<RankedDeal | null>(null);

  const [search, setSearch] = useState("");
  const [sortHigh, setSortHigh] = useState(true);

  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<RankedDeal | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [closeTarget, setCloseTarget] = useState<RankedDeal | null>(null);
  const [closeOutcome, setCloseOutcome] = useState<"won" | "lost">("won");
  const [closing, setClosing] = useState(false);

  const [wonStageId, setWonStageId] = useState<string | null>(null);
  const [lostStageId, setLostStageId] = useState<string | null>(null);
  const [stageMap, setStageMap] = useState<Record<string, string>>({});

  /* ================= FETCH ================= */

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listDeals({
        limit: 100, sortBy: "updatedAt", sortOrder: "desc",
      });
      setDeals(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load deals");
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{
          success: boolean;
          data: {
            stages: Array<{
              _id: string;
              name: string;
              isWon?: boolean;
              isLost?: boolean;
            }>;
          };
        }>("/api/pipelines/default");

        const stages = res?.data?.stages ?? [];
        if (cancelled) return;

        const map: Record<string, string> = {};
        stages.forEach((s) => { map[s._id] = s.name; });
        setStageMap(map);

        setWonStageId(stages.find((s) => s.isWon)?._id ?? null);
        setLostStageId(stages.find((s) => s.isLost)?._id ?? null);
      } catch (err) {
        console.error("Failed to load pipeline stages", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ================= IMPORT HANDLERS ================= */

  const handleDownloadTemplate = () => {
    const csv = buildImportTemplate();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "situs-deals-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelected = async (file: File) => {
    try {
      setImporting(true);
      setImportResult(null);
      const rows = await parseDealsFile(file);
      if (rows.length === 0) { toast.error("No rows found in file"); return; }
      const result = await importDeals(rows);
      setImportResult(result);
      toast.success(result.imported + " deals imported");
      await fetchDeals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    if (importing) return;
    setShowImport(false);
    setImportResult(null);
  };

  /* ================= DELETE HANDLERS ================= */

  const closeDelete = () => { if (deleting) return; setDeleteTarget(null); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteDeal(deleteTarget._id);
      setDeals((current) => current.filter((d) => d._id !== deleteTarget._id));
      toast.success("Deal deleted");
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to delete deal");
    } finally {
      setDeleting(false);
    }
  };

  /* ================= WON / LOST HANDLERS ================= */

  const openCloseModal = (deal: RankedDeal, outcome: "won" | "lost") => {
    setCloseTarget(deal);
    setCloseOutcome(outcome);
  };

  const closeCloseModal = () => { if (closing) return; setCloseTarget(null); };

  const handleMarkClosed = async () => {
    if (!closeTarget) return;
    try {
      setClosing(true);
      const updated = await apiFetch<{ success: boolean; data: BackendDeal }>(
        "/api/deals/" + closeTarget._id,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: closeOutcome,
            ...(closeOutcome === "won" && wonStageId ? { stageId: wonStageId } : {}),
            ...(closeOutcome === "lost" && lostStageId ? { stageId: lostStageId } : {}),
          }),
        }
      );

      const savedDeal = updated?.data;
      setDeals((current) =>
        current.map((d) => {
          if (d._id !== closeTarget._id) return d;
          if (savedDeal && savedDeal._id) return savedDeal;
          return { ...d, status: closeOutcome } as BackendDeal;
        })
      );

      toast.success(closeOutcome === "won" ? "Deal marked as Won" : "Deal marked as Lost");
      setCloseTarget(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to update deal");
    } finally {
      setClosing(false);
    }
  };

  /* ================= TRANSFORM ================= */

  const rankedDeals: RankedDeal[] = useMemo(
    () => deals.map((d) => mapBackendDealToRanked(d, stageMap)),
    [deals, stageMap]
  );

  /* ================= FILTER ================= */

  const finalDeals = useMemo(() => {
    let data = [...rankedDeals];
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((d) => d.name.toLowerCase().includes(q));
    }
    data.sort((a, b) => sortHigh ? b.value - a.value : a.value - b.value);
    return data;
  }, [rankedDeals, search, sortHigh]);

  /* ================= METRICS ================= */

  const pipelineValue = useMemo(
    () => deals.reduce((s, d) => s + d.value, 0),
    [deals]
  );

  const dealsAtRisk = useMemo(
    () => rankedDeals.filter((d) => d.riskScore >= 70).length,
    [rankedDeals]
  );

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-16 bg-zinc-100 rounded-lg" />
          <div className="h-7 w-40 bg-zinc-100 rounded-lg" />
          <div className="h-4 w-64 bg-zinc-100 rounded-lg" />
        </div>
        <div className="h-24 bg-zinc-50 rounded-2xl animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-zinc-50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <>
      <PageContainer>

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors mb-2 group"
            >
              <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
              Back
            </button>
            <h1 className="text-[28px] font-semibold text-zinc-900 tracking-tight">
              Deals
            </h1>
            <p className="text-[14px] text-zinc-400 mt-1">
              Track revenue, risk, and momentum
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 border border-zinc-200 text-zinc-700 px-4 py-2.5 rounded-xl text-[13px] font-medium hover:bg-zinc-50 hover:border-zinc-300 active:scale-[0.97] transition-all"
            >
              <Upload size={15} />
              Import
            </button>
            <button
              onClick={() => setSelectedDeal({} as RankedDeal)}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2.5 rounded-xl text-[13px] font-medium hover:bg-zinc-700 active:scale-[0.97] transition-all"
            >
              <Plus size={15} />
              Add Deal
            </button>
          </div>
        </div>

        {/* HERO */}
        <Card className="bg-gradient-to-br from-zinc-950 to-zinc-800 text-white border-none">
          <h2 className="text-3xl font-bold tracking-tight tabular-nums">
            {formatCurrency(pipelineValue, currency)}
          </h2>
          <p className="text-white/70 mt-2 text-[13.5px]">
            Pipeline Value <span className="text-white/40 mx-1.5">·</span> {deals.length} deal{deals.length === 1 ? "" : "s"}
          </p>
        </Card>

        {/* METRICS */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Card><MetricCard title="Total Deals" value={deals.length.toString()} /></Card>
          <Card><MetricCard title="Pipeline Value" value={formatCurrency(pipelineValue, currency)} /></Card>
          <Card className={dealsAtRisk > 0 ? "border-red-100 hover:border-red-200" : ""}>
            <MetricCard title="At Risk" value={dealsAtRisk.toString()} />
          </Card>
        </div>

        {/* FILTER */}
        <Card>
          <div className="flex gap-3">
            <input
              placeholder="Search deals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3.5 py-2.5 border border-zinc-200 rounded-xl text-[13.5px] outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5"
            />
            <button
              onClick={() => setSortHigh((s) => !s)}
              className="px-4 py-2.5 border border-zinc-200 rounded-xl text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 active:scale-[0.97] transition-all whitespace-nowrap"
            >
              {sortHigh ? `${currencySymbol} High → Low` : `${currencySymbol} Low → High`}
            </button>
          </div>
        </Card>

        {/* TABLE */}
        <Card className="p-0 overflow-hidden">
          {finalDeals.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-zinc-900 text-[14px] font-medium">
                {search ? "No deals match your search" : "No deals yet"}
              </p>
              {!search && (
                <p className="text-zinc-400 text-[13px] mt-1">
                  Add your first deal or import from a spreadsheet
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-[13.5px]">
                <thead className="text-left text-zinc-400 bg-zinc-50/60 border-b border-zinc-100">
                  <tr>
                    <th className="py-3 px-4 font-medium text-[11px] uppercase tracking-wide">Deal</th>
                    <th className="py-3 px-4 font-medium text-[11px] uppercase tracking-wide">Stage</th>
                    <th className="py-3 px-4 font-medium text-[11px] uppercase tracking-wide">Value</th>
                    <th className="py-3 px-4 font-medium text-[11px] uppercase tracking-wide">Probability</th>
                    <th className="py-3 px-4 font-medium text-[11px] uppercase tracking-wide">Risk</th>
                    <th className="py-3 px-4 font-medium text-[11px] uppercase tracking-wide">Momentum</th>
                    <th className="py-3 px-4 font-medium text-[11px] uppercase tracking-wide text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {finalDeals.map((deal) => {
                    const momentum = getMomentum(deal.lastActivityDays);
                    const Icon = momentum.icon;
                    const isClosed = deal.status === "won" || deal.status === "lost";
                    const stagePill = getStagePill(deal.stageName);

                    return (
                      <tr
                        key={deal._id}
                        className="border-t border-zinc-100 hover:bg-zinc-50/60 cursor-pointer align-middle transition-colors"
                        onClick={() => setSelectedDeal(deal)}
                      >
                        <td className="py-3.5 px-4 font-medium text-zinc-900">
                          {deal.name}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full border ${stagePill}`}
                          >
                            {deal.stageName}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 tabular-nums text-zinc-700 font-medium">
                          {formatCurrency(deal.value, currency)}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums w-9 text-zinc-700">
                              {deal.probability}%
                            </span>
                            <div className="w-20 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-zinc-900 rounded-full transition-all"
                                style={{ width: `${deal.probability}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className={`py-3.5 px-4 font-semibold tabular-nums ${getRiskColor(deal.riskScore)}`}>
                          {deal.riskScore}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 font-medium ${momentum.color}`}>
                            <Icon size={14} />
                            {momentum.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {!isClosed && (
                              <>
                                <button
                                  title="Mark as Won"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCloseModal(deal, "won");
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-emerald-200 active:scale-95 transition-all text-[11.5px] font-medium"
                                >
                                  <CheckCircle2 size={13} />
                                  Won
                                </button>
                                <button
                                  title="Mark as Lost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCloseModal(deal, "lost");
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 border border-zinc-200 active:scale-95 transition-all text-[11.5px] font-medium"
                                >
                                  <XCircle size={13} />
                                  Lost
                                </button>
                              </>
                            )}
                            <button
                              title="Delete deal"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(deal);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </PageContainer>

      {/* DRAWER */}
      <DealDrawer
        deal={selectedDeal}
        onClose={() => setSelectedDeal(null)}
        onUpdate={(savedDeal) => {
          setSelectedDeal(null);
          setDeals((current) => {
            const exists = current.some((d) => d._id === savedDeal._id);
            if (!exists) return [savedDeal, ...current];
            return current.map((d) => d._id === savedDeal._id ? savedDeal : d);
          });
        }}
      />

      {/* WON / LOST CONFIRMATION MODAL */}
      {closeTarget && (
        <div
          className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onClick={closeCloseModal}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              {closeOutcome === "won" ? (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                </div>
              ) : (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-100">
                  <XCircle size={18} className="text-zinc-500" />
                </div>
              )}
              <div>
                <h2 className="text-[16px] font-semibold text-zinc-900">
                  {closeOutcome === "won" ? "Mark deal as Won?" : "Mark deal as Lost?"}
                </h2>
                <p className="text-[13px] text-zinc-500">
                  This closes the deal and records the date.
                </p>
              </div>
            </div>

            <p className="text-[13.5px] text-zinc-600 leading-relaxed">
              You&apos;re about to mark{" "}
              <span className="font-medium text-zinc-900">
                {closeTarget.name || "this deal"}
              </span>{" "}
              as{" "}
              <span className="font-medium text-zinc-900">
                {closeOutcome === "won" ? "Won" : "Lost"}
              </span>.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeCloseModal}
                disabled={closing}
                className="flex-1 border border-zinc-200 py-2.5 rounded-xl text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkClosed}
                disabled={closing}
                className="flex-1 bg-zinc-900 text-white py-2.5 rounded-xl text-[13px] font-medium hover:bg-zinc-700 disabled:opacity-60 active:scale-[0.97] transition-all"
              >
                {closing ? "Saving..." : closeOutcome === "won" ? "Mark Won" : "Mark Lost"}
              </button>
            </div>
          </m.div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onClick={closeDelete}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-50">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-zinc-900">Delete deal?</h2>
                <p className="text-[13px] text-zinc-500">This can&apos;t be undone.</p>
              </div>
            </div>

            <p className="text-[13.5px] text-zinc-600 leading-relaxed">
              You&apos;re about to delete{" "}
              <span className="font-medium text-zinc-900">
                {deleteTarget.name || "this deal"}
              </span>.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeDelete}
                disabled={deleting}
                className="flex-1 border border-zinc-200 py-2.5 rounded-xl text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-[13px] font-medium hover:bg-red-700 disabled:opacity-60 active:scale-[0.97] transition-all"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </m.div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {showImport && (
        <div
          className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onClick={closeImport}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-[16px] font-semibold text-zinc-900">Import deals</h2>
              <p className="text-[13px] text-zinc-500 mt-1">
                Bring your existing deals into Situs.
              </p>
            </div>

            {!importResult ? (
              <>
                <div className="space-y-3 text-[13.5px]">
                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-zinc-900">1.</span>
                    <div>
                      <p className="text-zinc-700">Download the template</p>
                      <button
                        onClick={handleDownloadTemplate}
                        className="mt-1 text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
                      >
                        Download situs-deals-template.csv
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-zinc-900">2.</span>
                    <p className="text-zinc-700">Fill it with your deals (title, value, probability)</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-zinc-900">3.</span>
                    <p className="text-zinc-700">Upload the file below (CSV or Excel)</p>
                  </div>
                </div>

                <label className="block border-2 border-dashed border-zinc-200 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/50 transition-colors">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    disabled={importing}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelected(file);
                      e.target.value = "";
                    }}
                  />
                  <span className="text-[13.5px] text-zinc-500">
                    {importing ? "Importing..." : "Click to choose a CSV or Excel file"}
                  </span>
                </label>

                <button
                  onClick={closeImport}
                  disabled={importing}
                  className="w-full border border-zinc-200 py-2.5 rounded-xl text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 active:scale-[0.97] transition-all"
                >
                  Cancel
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-[13.5px] text-emerald-700 font-medium">
                  {importResult.imported} deals imported
                </div>
                {importResult.skipped > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-[13.5px] text-amber-700">
                    {importResult.skipped} skipped
                    <ul className="mt-2 space-y-1 text-[12px]">
                      {importResult.skippedRows.slice(0, 10).map((s) => (
                        <li key={s.row}>Row {s.row}: {s.reason}</li>
                      ))}
                      {importResult.skippedRows.length > 10 && (
                        <li>…and {importResult.skippedRows.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                )}
                <button
                  onClick={closeImport}
                  className="w-full bg-zinc-900 text-white py-2.5 rounded-xl text-[13px] font-medium hover:bg-zinc-700 active:scale-[0.97] transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </m.div>
        </div>
      )}
    </>
  );
}