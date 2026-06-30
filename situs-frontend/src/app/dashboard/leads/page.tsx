"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, ArrowRight, Upload, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import MetricCard from "../../../components/dashboard/metric-card";
import LeadDrawer from "../../../components/drawers/lead-drawer";
import { apiFetch } from "@/lib/api";
import { createDeal } from "../../../lib/intelligence/deals.api";
import {
  buildLeadImportTemplate,
  parseLeadsFile,
  bulkCreateLeads,
} from "../../../lib/intelligence/leads.api";

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-slate-50">
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">{children}</div>
  </div>
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
    whileHover={{ y: -2 }}
    className={`rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 p-5 ${className}`}
  >
    {children}
  </motion.div>
);

export type Lead = {
  _id: string;
  name: string;
  email?: string | null;
  phone: string;
  interestedLocation: string;
  budget: number;
  source: string;
  probability?: number;
  leadScore?: number;
  brainPriority?: "low" | "medium" | "high" | "critical";
  isArchived?: boolean;
  createdAt: string;
};

type LeadsResponse = {
  data: Lead[];
  total?: number;
};

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function normalizeLead(input: Partial<Lead>): Lead {
  return {
    _id: String(input._id ?? ""),
    name: typeof input.name === "string" ? input.name : "",
    email: typeof input.email === "string" ? input.email : "",
    phone: typeof input.phone === "string" ? input.phone : "",
    interestedLocation:
      typeof input.interestedLocation === "string"
        ? input.interestedLocation
        : "",
    budget:
      typeof input.budget === "number" ? input.budget : Number(input.budget) || 0,
    source: typeof input.source === "string" ? input.source : "MANUAL_ENTRY",
    probability:
      typeof input.probability === "number" ? input.probability : undefined,
    leadScore: typeof input.leadScore === "number" ? input.leadScore : undefined,
    brainPriority:
      input.brainPriority === "critical" ||
      input.brainPriority === "high" ||
      input.brainPriority === "medium" ||
      input.brainPriority === "low"
        ? input.brainPriority
        : "low",
    isArchived: input.isArchived === true,
    createdAt:
      typeof input.createdAt === "string"
        ? input.createdAt
        : new Date().toISOString(),
  };
}

function getPriorityBadge(priority?: Lead["brainPriority"]) {
  if (priority === "critical" || priority === "high") {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (priority === "medium") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-slate-100 text-slate-600 border-slate-200";
}

/* ================= CONVERT FORM STATE ================= */

type ConvertTarget = {
  lead: Lead;
  title: string;
  value: number;
  probability: number;
};

export default function LeadsPage() {
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortHigh, setSortHigh] = useState(true);

  /* Convert-to-deal mini-form state */
  const [convertTarget, setConvertTarget] = useState<ConvertTarget | null>(null);
  const [converting, setConverting] = useState(false);

  /* Import modal state */
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    failed: number;
    skipped: Array<{ row: number; reason: string }>;
  } | null>(null);

  /* Delete confirmation state */
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<LeadsResponse>("/api/leads?limit=100");
      setLeads(Array.isArray(res?.data) ? res.data.map(normalizeLead) : []);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  /* ================= CONVERT HANDLERS ================= */

  /* Open the mini-form, pre-filled from the lead */
  const openConvert = (lead: Lead) => {
    setConvertTarget({
      lead,
      title: lead.name || "Untitled Deal",
      value: lead.budget || 0,
      probability: 50,
    });
  };

  const closeConvert = () => {
    if (converting) return;
    setConvertTarget(null);
  };

  /* Create the deal, then archive the lead */
  const handleConvert = async () => {
    if (!convertTarget) return;

    const { lead, title, value, probability } = convertTarget;

    if (!title.trim()) {
      toast.error("Deal title is required");
      return;
    }

    try {
      setConverting(true);

      /* 1) Create the deal. Backend resolves the default pipeline + first
            stage when pipelineId/stageId are omitted. */
      await createDeal({
        title: title.trim(),
        value: Number(value) || 0,
        probability: Number(probability) || 0,
      });

      /* 2) Archive the original lead so it leaves the active list.
            Wrapped separately: if archiving fails (e.g. permissions),
            the deal still exists. We just warn instead of erroring out. */
      try {
        await apiFetch(`/api/leads/${lead._id}/actions/archive`, {
          method: "PATCH",
        });
      } catch (archiveErr) {
        console.error("Lead created as deal but archive failed", archiveErr);
        toast("Deal created. Lead could not be archived.", { icon: "!" });
      }

      /* 3) Remove the lead from local state immediately */
      setLeads((current) => current.filter((l) => l._id !== lead._id));

      toast.success("Lead converted to deal");
      setConvertTarget(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to convert lead");
    } finally {
      setConverting(false);
    }
  };

  /* ================= DELETE HANDLERS ================= */
  /* Backend's DELETE /api/leads/:id maps to archive, so we use the
     proven archive action endpoint directly. The lead leaves the list. */

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await apiFetch(`/api/leads/${deleteTarget._id}/actions/archive`, {
        method: "PATCH",
      });

      setLeads((current) => current.filter((l) => l._id !== deleteTarget._id));
      toast.success("Lead deleted");
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to delete lead");
    } finally {
      setDeleting(false);
    }
  };

  /* ================= IMPORT HANDLERS ================= */

  const handleDownloadTemplate = () => {
    const csv = buildLeadImportTemplate();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "situs-leads-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      setImporting(true);
      setImportResult(null);

      /* Smart parser reads CSV and Excel, with fuzzy header matching. */
      const { valid, skipped } = await parseLeadsFile(file);

      if (valid.length === 0) {
        toast.error("No valid rows found in file");
        setImportResult({ created: 0, failed: 0, skipped });
        return;
      }

      const result = await bulkCreateLeads(valid);

      setImportResult({
        created: result.created,
        failed: result.failed,
        skipped,
      });

      toast.success(`✅ ${result.created} leads imported`);

      /* Refresh so newly imported leads appear */
      await fetchLeads();
    } catch (err) {
      console.error(err);
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

  /* ================= DERIVED ================= */

  const processedLeads = useMemo(() => {
    /* Safety net: never show archived leads, regardless of backend */
    const active = leads.filter((lead) => !lead.isArchived);

    const q = search.trim().toLowerCase();
    const data = q
      ? active.filter(
          (lead) =>
            lead.name.toLowerCase().includes(q) ||
            lead.phone.toLowerCase().includes(q) ||
            lead.interestedLocation.toLowerCase().includes(q) ||
            (lead.email || "").toLowerCase().includes(q)
        )
      : [...active];

    data.sort((a, b) => (sortHigh ? b.budget - a.budget : a.budget - b.budget));
    return data;
  }, [leads, search, sortHigh]);

  const metrics = useMemo(
    () => ({
      total: processedLeads.length,
      qualified: processedLeads.filter(
        (lead) => lead.brainPriority === "high" || lead.brainPriority === "critical"
      ).length,
      pipeline: processedLeads.reduce((sum, lead) => sum + lead.budget, 0),
    }),
    [processedLeads]
  );

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-16 bg-slate-200 rounded-md" />
          <div className="h-7 w-40 bg-slate-200 rounded-md" />
          <div className="h-4 w-64 bg-slate-100 rounded-md" />
        </div>
        <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-slate-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <PageContainer>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-2"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Leads
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Track potential customers from first touch to qualification
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center justify-center gap-2 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              <Upload size={16} />
              Import
            </button>

            <button
              onClick={() =>
                setSelectedLead(
                  normalizeLead({
                    _id: "",
                    name: "",
                    phone: "",
                    interestedLocation: "",
                    budget: 0,
                    source: "MANUAL_ENTRY",
                  })
                )
              }
              className="flex items-center justify-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-800 active:scale-[0.98] transition"
            >
              <Plus size={16} />
              Add Lead
            </button>
          </div>
        </div>

        <Card className="bg-slate-950 text-white border-none">
          <h2 className="text-3xl font-bold tracking-tight">{money(metrics.pipeline)}</h2>
          <p className="text-white/70 mt-2 text-sm">
            Pipeline value • {metrics.total} lead{metrics.total === 1 ? "" : "s"}
          </p>
        </Card>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Card className="bg-white">
            <MetricCard title="Total Leads" value={metrics.total.toString()} />
          </Card>
          <Card className="bg-white">
            <MetricCard title="Qualified" value={metrics.qualified.toString()} />
          </Card>
          <Card className="bg-white">
            <MetricCard title="Pipeline Value" value={money(metrics.pipeline)} />
          </Card>
        </div>

        <Card className="bg-white">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              placeholder="Search leads..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-black/5"
            />
            <button
              onClick={() => setSortHigh((current) => !current)}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap"
            >
              {sortHigh ? "High to Low" : "Low to High"}
            </button>
          </div>
        </Card>

        <Card className="bg-white p-0 overflow-hidden">
          {processedLeads.length === 0 ? (
            <div className="text-center py-20 text-sm">
              <p className="text-slate-500">
                {search ? "No leads match your search" : "No leads yet"}
              </p>
              {!search && (
                <p className="text-slate-400 text-xs mt-1">
                  Add your first lead or import from a spreadsheet
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="text-left text-slate-500 bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 px-4 font-medium">Phone</th>
                    <th className="py-3 px-4 font-medium">Location</th>
                    <th className="py-3 px-4 font-medium">Budget</th>
                    <th className="py-3 px-4 font-medium">Priority</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {processedLeads.map((lead) => (
                    <tr
                      key={lead._id}
                      className="border-t border-slate-100 hover:bg-slate-50/80 cursor-pointer align-middle transition-colors"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="py-3.5 px-4 font-medium text-slate-900">{lead.name || "Untitled"}</td>
                      <td className="py-3.5 px-4 text-slate-700">{lead.phone || "-"}</td>
                      <td className="py-3.5 px-4 text-slate-700">{lead.interestedLocation || "-"}</td>
                      <td className="py-3.5 px-4 tabular-nums text-slate-700">{money(lead.budget)}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-1 text-xs rounded-full border ${getPriorityBadge(
                            lead.brainPriority
                          )}`}
                        >
                          {lead.brainPriority ?? "low"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openConvert(lead);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            Convert
                            <ArrowRight size={13} />
                          </button>

                          <button
                            title="Delete lead"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(lead);
                            }}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageContainer>

      {/* ================= CONVERT MINI-FORM ================= */}
      {convertTarget && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onClick={closeConvert}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Convert to deal</h2>
              <p className="text-sm text-slate-500 mt-1">
                Promote {convertTarget.lead.name || "this lead"} into your deal
                pipeline.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Deal title
                </label>
                <input
                  value={convertTarget.title}
                  onChange={(e) =>
                    setConvertTarget((t) =>
                      t ? { ...t, title: e.target.value } : t
                    )
                  }
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-black/5"
                  placeholder="Deal title"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Value (Rs.)
                </label>
                <input
                  type="number"
                  value={convertTarget.value}
                  onChange={(e) =>
                    setConvertTarget((t) =>
                      t ? { ...t, value: Number(e.target.value) } : t
                    )
                  }
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-black/5"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Probability: {convertTarget.probability}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={convertTarget.probability}
                  onChange={(e) =>
                    setConvertTarget((t) =>
                      t ? { ...t, probability: Number(e.target.value) } : t
                    )
                  }
                  className="w-full accent-black"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeConvert}
                disabled={converting}
                className="flex-1 border border-slate-300 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConvert}
                disabled={converting}
                className="flex-1 bg-black text-white py-2 rounded-lg text-sm hover:bg-slate-800 disabled:opacity-60 transition-colors"
              >
                {converting ? "Converting..." : "Create Deal"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ================= DELETE CONFIRMATION MODAL ================= */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onClick={closeDelete}
        >
          <motion.div
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
                <h2 className="text-lg font-semibold text-slate-900">Delete lead?</h2>
                <p className="text-sm text-slate-500">This can&apos;t be undone.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              You&apos;re about to delete{" "}
              <span className="font-medium text-slate-900">
                {deleteTarget.name || "this lead"}
              </span>
              .
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeDelete}
                disabled={deleting}
                className="flex-1 border border-slate-300 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ================= IMPORT MODAL ================= */}
      {showImport && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onClick={closeImport}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import leads</h2>
              <p className="text-sm text-slate-500 mt-1">
                Bulk-add leads from a CSV or Excel file.
              </p>
            </div>

            {!importResult ? (
              <>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">1.</span>
                    <div>
                      <p className="text-slate-700">Download the template</p>
                      <button
                        onClick={handleDownloadTemplate}
                        className="mt-1 text-emerald-600 hover:text-emerald-700 underline"
                      >
                        Download situs-leads-template.csv
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">2.</span>
                    <p className="text-slate-700">
                      Fill it in: name, phone, email, budget,
                      interestedLocation, source
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">3.</span>
                    <p className="text-slate-700">Upload the file below (CSV or Excel)</p>
                  </div>
                </div>

                <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50/50 transition-colors">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    disabled={importing}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                      e.target.value = "";
                    }}
                  />
                  <span className="text-sm text-slate-500">
                    {importing ? "Importing..." : "Click to choose a CSV or Excel file"}
                  </span>
                </label>

                <button
                  onClick={closeImport}
                  disabled={importing}
                  className="w-full border border-slate-300 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                  {importResult.created} leads imported
                  {importResult.failed > 0 &&
                    ` (${importResult.failed} failed on server)`}
                </div>

                {importResult.skipped.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
                    {importResult.skipped.length} rows skipped
                    <ul className="mt-2 space-y-1 text-xs">
                      {importResult.skipped.slice(0, 10).map((s) => (
                        <li key={s.row}>
                          Row {s.row}: {s.reason}
                        </li>
                      ))}
                      {importResult.skipped.length > 10 && (
                        <li>...and {importResult.skipped.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                )}

                <button
                  onClick={closeImport}
                  className="w-full bg-black text-white py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      <LeadDrawer
        lead={selectedLead}
        onClose={() => {
          setSelectedLead(null);
          fetchLeads();
        }}
        onUpdate={(lead) => {
          const clean = normalizeLead(lead);
          if (!clean._id) return;

          setLeads((current) =>
            current.some((existing) => existing._id === clean._id)
              ? current.map((existing) =>
                  existing._id === clean._id ? clean : existing
                )
              : [clean, ...current]
          );
        }}
      />
    </>
  );
}
