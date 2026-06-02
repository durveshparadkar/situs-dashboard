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
} from "lucide-react";
import toast from "react-hot-toast";

import MetricCard from "../../../components/dashboard/metric-card";
import DealDrawer from "../../../components/drawers/deal-drawer";

import {
  listDeals,
  importDeals,
  parseDealsCsv,
  buildImportTemplate,
  type BackendDeal,
  type ImportResult,
} from "../../../lib/intelligence/deals.api";

/* ================= GLOBAL UI ================= */

const PageContainer = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-slate-50">
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {children}
    </div>
  </div>
);

const Card = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <m.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-2xl border bg-white shadow-sm p-5 ${className}`}
  >
    {children}
  </m.div>
);

/* ================= TYPES ================= */

type RankedDeal = {
  _id: string;
  name: string;
  value: number;
  probability: number;
  riskScore: number;
  lastActivityDays: number;
};

/* ================= HELPERS ================= */

function getMomentum(days: number) {
  if (days >= 10)
    return { icon: ArrowDownRight, color: "text-red-600", label: "Falling" };
  if (days >= 6)
    return { icon: ArrowRight, color: "text-slate-500", label: "Stable" };
  return {
    icon: ArrowUpRight,
    color: "text-emerald-600",
    label: "Improving",
  };
}

function getRiskColor(score: number) {
  if (score >= 70) return "text-red-600";
  if (score >= 40) return "text-yellow-600";
  return "text-emerald-600";
}

/* Days since the deal's last activity */
function getLastActivityDays(deal: BackendDeal): number {
  if (!deal.lastActivityAt) return 0;
  const last = new Date(deal.lastActivityAt).getTime();
  return Math.max(
    0,
    Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24))
  );
}

/* Map BackendDeal → RankedDeal shape the existing UI expects.
   Backend already ran the risk engine — we trust riskScore from the wire. */
function mapBackendDealToRanked(d: BackendDeal): RankedDeal {
  return {
    _id:              d._id,
    name:             d.title,
    value:            d.value,
    probability:      d.probability ?? 0,
    riskScore:        d.riskScore ?? 0,
    lastActivityDays: getLastActivityDays(d),
  };
}

/* ================= PAGE ================= */

export default function DealsPage() {
  const router = useRouter();

  const [deals, setDeals] = useState<BackendDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<RankedDeal | null>(null);

  const [search, setSearch] = useState("");
  const [sortHigh, setSortHigh] = useState(true);

  /* Import modal state */
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  /* ================= FETCH ================= */

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);

      /* Calls backend GET /api/deals — authenticated, multi-tenant scoped */
      const res = await listDeals({
        limit:     100,
        sortBy:    "updatedAt",
        sortOrder: "desc",
      });

      setDeals(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to load deals"
      );
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

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

      const text = await file.text();
      const rows = parseDealsCsv(text);

      if (rows.length === 0) {
        toast.error("No rows found in file");
        return;
      }

      const result = await importDeals(rows);
      setImportResult(result);
      toast.success(result.imported + " deals imported");

      /* Refresh the list so newly imported deals appear */
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

  /* ================= TRANSFORM =================
     Risk scoring used to happen client-side. Now backend ships the
     risk score on every deal — we just map shapes. */

  const rankedDeals: RankedDeal[] = useMemo(() => {
    return deals.map(mapBackendDealToRanked);
  }, [deals]);

  /* ================= FILTER ================= */

  const finalDeals = useMemo(() => {
    let data = [...rankedDeals];

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((d) => d.name.toLowerCase().includes(q));
    }

    data.sort((a, b) =>
      sortHigh ? b.value - a.value : a.value - b.value
    );

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
      <div className="max-w-7xl mx-auto p-6 space-y-6 animate-pulse">
        <div className="h-10 w-60 bg-slate-200 rounded" />
        <div className="h-64 bg-slate-200 rounded-xl" />
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
              className="flex items-center gap-2 text-sm text-slate-500 mb-2"
            >
              <ArrowLeft size={16} />
              Back
            </button>

            <h1 className="text-2xl font-semibold">Deals</h1>
            <p className="text-sm text-slate-500">
              Track revenue, risk, and momentum
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 border border-slate-300 px-4 py-2 rounded-lg text-sm"
            >
              <Upload size={16} />
              Import
            </button>

            <button
              onClick={() => setSelectedDeal({} as RankedDeal)}
              className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm"
            >
              <Plus size={16} />
              Add Deal
            </button>
          </div>
        </div>

        {/* HERO */}
        <Card className="bg-gradient-to-br from-slate-950 to-slate-800 text-white border-none">
          <h2 className="text-3xl font-bold">
            ₹{pipelineValue.toLocaleString()}
          </h2>

          <p className="text-white/70 mt-2">
            Pipeline Value • {deals.length} deals
          </p>
        </Card>

        {/* METRICS */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card><MetricCard title="Total Deals" value={deals.length.toString()} /></Card>
          <Card><MetricCard title="Pipeline Value" value={`₹${pipelineValue.toLocaleString()}`} /></Card>
          <Card><MetricCard title="At Risk" value={dealsAtRisk.toString()} /></Card>
        </div>

        {/* FILTER */}
        <Card>
          <div className="flex gap-3">
            <input
              placeholder="Search deals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />

            <button
              onClick={() => setSortHigh((s) => !s)}
              className="px-4 py-2 border rounded-lg text-sm"
            >
              {sortHigh ? "₹ High → Low" : "₹ Low → High"}
            </button>
          </div>
        </Card>

        {/* TABLE */}
        <Card className="p-0 overflow-hidden">
          {finalDeals.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              No deals found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 bg-slate-50">
                <tr>
                  <th className="p-4">Deal</th>
                  <th>Value</th>
                  <th>Probability</th>
                  <th>Risk</th>
                  <th>Momentum</th>
                </tr>
              </thead>

              <tbody>
                {finalDeals.map((deal) => {
                  const momentum = getMomentum(deal.lastActivityDays);
                  const Icon = momentum.icon;

                  return (
                    <tr
                      key={deal._id}
                      className="border-t hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <td className="p-4 font-medium">{deal.name}</td>

                      <td>₹{deal.value.toLocaleString()}</td>

                      <td>
                        <div className="flex items-center gap-2">
                          {deal.probability}%
                          <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-black"
                              style={{ width: `${deal.probability}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className={getRiskColor(deal.riskScore)}>
                        {deal.riskScore}
                      </td>

                      <td className={`flex items-center gap-1 ${momentum.color}`}>
                        <Icon size={14} />
                        {momentum.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {/* IMPORT MODAL */}
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
              <h2 className="text-lg font-semibold">Import deals</h2>
              <p className="text-sm text-slate-500 mt-1">
                Bring your existing deals into Situs.
              </p>
            </div>

            {!importResult ? (
              <>
                {/* ============================================
                    FUTURE: CRM connect options go here.
                    When HubSpot / Salesforce OAuth is built, add
                    rows above the CSV option, e.g.:
                      [ Connect HubSpot ]
                      [ Connect Salesforce ]
                    For now, CSV upload is the only working source.
                ============================================ */}

                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">1.</span>
                    <div>
                      <p>Download the template</p>
                      <button
                        onClick={handleDownloadTemplate}
                        className="mt-1 text-emerald-600 underline"
                      >
                        Download situs-deals-template.csv
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="font-semibold text-slate-900">2.</span>
                    <p>Fill it with your deals (title, value, probability)</p>
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
                      if (file) handleFileSelected(file);
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
                  {importResult.imported} deals imported
                </div>

                {importResult.skipped > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
                    {importResult.skipped} skipped
                    <ul className="mt-2 space-y-1 text-xs">
                      {importResult.skippedRows.slice(0, 10).map((s) => (
                        <li key={s.row}>
                          Row {s.row}: {s.reason}
                        </li>
                      ))}
                      {importResult.skippedRows.length > 10 && (
                        <li>
                          …and {importResult.skippedRows.length - 10} more
                        </li>
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
    </>
  );
}
