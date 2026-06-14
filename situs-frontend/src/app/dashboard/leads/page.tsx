"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, ArrowRight, Upload } from "lucide-react";
import toast from "react-hot-toast";

import MetricCard from "../../../components/dashboard/metric-card";
import LeadDrawer from "../../../components/drawers/lead-drawer";
import { apiFetch } from "@/lib/api";
import { createDeal } from "../../../lib/intelligence/deals.api";
import {
  buildLeadImportTemplate,
  parseLeadsCsv,
  bulkCreateLeads,
} from "../../../lib/intelligence/leads.api";

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-slate-50">
    <div className="max-w-7xl mx-auto p-6 space-y-8">{children}</div>
  </div>
);

const Card = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-xl border bg-white shadow-sm p-5 ${className}`}
  >
    {children}
  </div>
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
  return `Rs. ${value.toLocaleString("en-IN")}`;
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

  /* CSV import modal state */
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    failed: number;
    skipped: Array<{ row: number; reason: string }>;
  } | null>(null);

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

      const text = await file.text();
      const { valid, skipped } = parseLeadsCsv(text);

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

      toast.success(` ${result.created} leads imported`);

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
      qualified: processedLeads.filter((lead) => (lead.probability ?? 0) >= 50)
        .length,
      pipeline: processedLeads.reduce((sum, lead) => sum + lead.budget, 0),
    }),
    [processedLeads]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 animate-pulse space-y-6">
        <div className="h-10 w-60 bg-slate-200 rounded" />
        <div className="h-64 bg-slate-200 rounded-xl" />
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
              className="flex items-center gap-2 text-sm text-slate-500 mb-2"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <h1 className="text-2xl font-semibold">Leads</h1>
            <p className="text-sm text-slate-500">
              Track potential customers from first touch to qualification
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center justify-center gap-2 border border-slate-300 px-4 py-2 rounded-lg text-sm"
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
              className="flex items-center justify-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm"
            >
              <Plus size={16} />
              Add Lead
            </button>
          </div>
        </div>

        <Card className="bg-slate-950 text-white border-none">
          <h2 className="text-3xl font-bold">{money(metrics.pipeline)}</h2>
          <p className="text-white/70 mt-2">
            Pipeline value - {metrics.total} leads
          </p>
        </Card>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <MetricCard title="Total Leads" value={metrics.total.toString()} />
          </Card>
          <Card>
            <MetricCard title="Qualified" value={metrics.qualified.toString()} />
          </Card>
          <Card>
            <MetricCard title="Pipeline Value" value={money(metrics.pipeline)} />
          </Card>
        </div>

        <Card>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              placeholder="Search leads..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button
              onClick={() => setSortHigh((current) => !current)}
              className="px-4 py-2 border rounded-lg text-sm"
            >
              {sortHigh ? "High to Low" : "Low to High"}
            </button>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          {processedLeads.length === 0 ? (
            <div className="text-center py-20 text-slate-500 text-sm">
              No leads found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-slate-500 bg-slate-50">
                  <tr>
                    <th className="p-4">Name</th>
                    <th>Phone</th>
                    <th>Location</th>
                    <th>Budget</th>
                    <th>Priority</th>
                    <th className="text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {processedLeads.map((lead) => (
                    <tr
                      key={lead._id}
                      className="border-t hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="p-4 font-medium">{lead.name || "Untitled"}</td>
                      <td>{lead.phone || "-"}</td>
                      <td>{lead.interestedLocation || "-"}</td>
                      <td>{money(lead.budget)}</td>
                      <td>
                        <span
                          className={`px-2 py-1 text-xs rounded-full border ${getPriorityBadge(
                            lead.brainPriority
                          )}`}
                        >
                          {lead.brainPriority ?? "low"}
                        </span>
                      </td>
                      <td className="text-right pr-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openConvert(lead);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100"
                        >
                          Convert
                          <ArrowRight size={13} />
                        </button>
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
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={closeConvert}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-semibold">Convert to deal</h2>
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
                  className="w-full px-3 py-2 border rounded-lg text-sm"
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
                  className="w-full px-3 py-2 border rounded-lg text-sm"
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
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeConvert}
                disabled={converting}
                className="flex-1 border border-slate-300 py-2 rounded-lg text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConvert}
                disabled={converting}
                className="flex-1 bg-black text-white py-2 rounded-lg text-sm disabled:opacity-60"
              >
                {converting ? "Converting..." : "Create Deal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= IMPORT MODAL ================= */}
      {showImport && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={closeImport}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-semibold">Import leads</h2>
              <p className="text-sm text-slate-500 mt-1">
                Bulk-add leads from a CSV file.
              </p>
            </div>

            {!importResult ? (
              <>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">1.</span>
                    <div>
                      <p>Download the template</p>
                      <button
                        onClick={handleDownloadTemplate}
                        className="mt-1 text-emerald-600 underline"
                      >
                        Download situs-leads-template.csv
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">2.</span>
                    <p>
                      Fill it in: name, phone, email, budget,
                      interestedLocation, source
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">3.</span>
                    <p>Upload the file below</p>
                  </div>
                </div>

                <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-slate-400">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={importing}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                      e.target.value = "";
                    }}
                  />
                  <span className="text-sm text-slate-500">
                    {importing ? "Importing..." : "Click to choose a CSV file"}
                  </span>
                </label>

                <button
                  onClick={closeImport}
                  disabled={importing}
                  className="w-full border border-slate-300 py-2 rounded-lg text-sm text-slate-600"
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
                  className="w-full bg-black text-white py-2 rounded-lg text-sm"
                >
                  Done
                </button>
              </div>
            )}
          </div>
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
