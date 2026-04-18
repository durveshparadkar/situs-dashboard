"use client";

import { useEffect, useMemo, useState } from "react";
import MetricCard from "../../../components/dashboard/metric-card";
import LeadDrawer from "../../../components/drawers/lead-drawer";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

/* ================= TYPES ================= */

type Lead = {
  _id: string;
  name: string;
  email?: string;
  company: string;
  value?: number;
  status: "new" | "contacted" | "qualified" | "converted";
  createdAt: string;
};

/* ================= HELPERS ================= */

function getProbabilityFromStatus(status: string) {
  if (status === "new") return 30;
  if (status === "contacted") return 50;
  if (status === "qualified") return 70;
  return 40;
}

function getStatusStyle(status: Lead["status"]) {
  if (status === "qualified") return "bg-emerald-50 text-emerald-700";
  if (status === "contacted") return "bg-amber-50 text-amber-700";
  if (status === "converted") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

/* ================= PAGE ================= */

export default function LeadsPage() {
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  const [isAddOpen, setIsAddOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    company: "",
    value: "",
  });

  /* ================= FETCH ================= */

  async function fetchLeads() {
    try {
      const res = await fetch("/api/leads");
      const json = await res.json();

      if (json.success) {
        setLeads(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  /* ================= FILTER ================= */

  const activeLeads = useMemo(() => {
    return leads.filter((l) => l.status !== "converted");
  }, [leads]);

  /* ================= METRICS ================= */

  const total = activeLeads.length;
  const qualified = activeLeads.filter((l) => l.status === "qualified").length;
  const pipelineValue = activeLeads.reduce(
    (t, l) => t + (l.value || 0),
    0
  );

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading leads...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-10">

      {/* HEADER */}
      <header className="space-y-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Leads</h1>
            <p className="text-sm text-slate-500">
              Manage incoming opportunities
            </p>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="bg-black text-white px-4 py-2 rounded-lg hover:scale-[1.02] transition"
          >
            + Add Lead
          </button>
        </div>
      </header>

      {/* METRICS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <MetricCard title="Total Leads" value={total.toString()} />
        <MetricCard title="Qualified" value={qualified.toString()} />
        <MetricCard
          title="Pipeline Value"
          value={`₹${pipelineValue.toLocaleString()}`}
        />
      </div>

      {/* LIST */}
      <div className="space-y-4">

        {activeLeads.length === 0 ? (
          <div className="text-center py-20 border rounded-xl bg-white">
            <p className="text-sm text-slate-500 mb-3">
              No leads yet
            </p>

            <button
              onClick={() => setIsAddOpen(true)}
              className="text-sm bg-black text-white px-4 py-2 rounded-md"
            >
              Add your first lead
            </button>
          </div>
        ) : (
          activeLeads.map((lead, index) => (
            <motion.div
              key={lead._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="border rounded-xl p-5 bg-white hover:shadow-md transition"
            >
              <div className="flex justify-between">

                <div>
                  <p className="font-semibold">{lead.name}</p>
                  <p className="text-sm text-slate-500">{lead.company}</p>

                  <span
                    className={`text-xs px-2 py-1 rounded ${getStatusStyle(
                      lead.status
                    )}`}
                  >
                    {lead.status}
                  </span>
                </div>

                <div className="text-right">
                  <p className="text-lg font-semibold">
                    ₹{(lead.value || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex justify-end gap-3 mt-4">

                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/deals", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          title: lead.name,
                          value: lead.value || 0,
                          probability: getProbabilityFromStatus(lead.status),
                          owner: "You",
                        }),
                      });

                      if (res.ok) {
                        await fetch("/api/leads", {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            id: lead._id,
                            status: "converted",
                          }),
                        });

                        setLeads((prev) =>
                          prev.map((l) =>
                            l._id === lead._id
                              ? { ...l, status: "converted" }
                              : l
                          )
                        );

                        toast.success("Converted to deal 🚀");
                      }
                    } catch (err) {
                      console.error(err);
                      toast.error("Conversion failed");
                    }
                  }}
                  className="text-sm bg-black text-white px-3 py-1 rounded"
                >
                  Convert
                </button>

                <button
                  onClick={() => setSelectedLead(lead)}
                  className="text-sm border px-3 py-1 rounded"
                >
                  View
                </button>
              </div>

            </motion.div>
          ))
        )}
      </div>

      {/* ADD LEAD MODAL */}
      <AnimatePresence>
        {isAddOpen && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-xl p-6 w-96"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
            >
              <h2 className="text-lg font-semibold mb-4">Add Lead</h2>

              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                className="w-full border p-2 rounded mb-3"
              />

              <input
                placeholder="Company"
                value={form.company}
                onChange={(e) =>
                  setForm({ ...form, company: e.target.value })
                }
                className="w-full border p-2 rounded mb-3"
              />

              <input
                placeholder="Value"
                type="number"
                value={form.value}
                onChange={(e) =>
                  setForm({ ...form, value: e.target.value })
                }
                className="w-full border p-2 rounded mb-3"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1 border rounded"
                >
                  Cancel
                </button>

                <button
                  onClick={async () => {
                    if (!form.name || !form.company) {
                      toast.error("Fill required fields");
                      return;
                    }

                    try {
                      const res = await fetch("/api/leads", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          name: form.name,
                          company: form.company,
                          value: Number(form.value) || 0,
                        }),
                      });

                      const result = await res.json();

                      if (result.success) {
                        setLeads((prev) => [result.data, ...prev]);
                        setForm({ name: "", company: "", value: "" });
                        setIsAddOpen(false);
                        toast.success("Lead created 🚀");
                      }
                    } catch (err) {
                      console.error(err);
                      toast.error("Error creating lead");
                    }
                  }}
                  className="bg-black text-white px-3 py-1 rounded"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER */}
      <LeadDrawer
        lead={selectedLead}
        onClose={() => {
          setSelectedLead(null);
          fetchLeads(); // 🔥 refresh after edit
        }}
      />
    </div>
  );
}