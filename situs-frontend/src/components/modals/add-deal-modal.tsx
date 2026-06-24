"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type Props = {
  onCloseAction: () => void;
  onCreatedAction: (deal: unknown) => void;
};

type Stage = {
  _id: string;
  name: string;
  probability?: number;
};

type Pipeline = {
  _id: string;
  name: string;
  stages: Stage[];
};

export default function AddDealModal({
  onCloseAction,
  onCreatedAction,
}: Props) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("50");
  const [loading, setLoading] = useState(false);

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stageId, setStageId] = useState("");
  const [pipelineLoading, setPipelineLoading] = useState(true);

  useEffect(() => {
    const loadPipeline = async () => {
      try {
        const json = await apiFetch<{ success: boolean; data: Pipeline }>(
  "/api/pipelines/default"
);
        if (json.success && json.data) {
          setPipeline(json.data);
          // Default to the first stage, and pre-fill probability from it
          const first = json.data.stages?.[0];
          if (first) {
            setStageId(first._id);
            if (typeof first.probability === "number") {
              setProbability(String(first.probability));
            }
          }
        }
      } catch (err) {
        console.error("Failed to load pipeline stages:", err);
      } finally {
        setPipelineLoading(false);
      }
    };
    loadPipeline();
  }, []);

  function handleStageChange(id: string) {
    setStageId(id);
    const stage = pipeline?.stages.find((s) => s._id === id);
    if (stage && typeof stage.probability === "number") {
      setProbability(String(stage.probability));
    }
  }

  async function handleSubmit() {
    if (!title || !value || !stageId || !pipeline) return;

    setLoading(true);

    try {
      const json = await apiFetch<{ success: boolean; data: unknown }>("/api/deals", {
        method: "POST",
        body: JSON.stringify({
          title,
          value: Number(value),
          probability: Number(probability),
          stageId,
          pipelineId: pipeline._id,
        }),
      });

      if (json.success) {
        onCreatedAction(json.data);
        onCloseAction();
      }
    } catch (err) {
      console.error("Create deal error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">

        <h2 className="text-lg font-semibold mb-4">Add Deal</h2>

        <div className="space-y-3">

          <input
            placeholder="Deal Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <input
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <select
            value={stageId}
            onChange={(e) => handleStageChange(e.target.value)}
            disabled={pipelineLoading || !pipeline}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {pipelineLoading && <option>Loading stages…</option>}
            {!pipelineLoading && !pipeline && <option>No pipeline found</option>}
            {pipeline?.stages.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Probability (%)"
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

        </div>

        <div className="flex justify-end gap-2 mt-6">

          <button
            onClick={onCloseAction}
            className="px-3 py-2 text-sm text-slate-500"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading || !stageId}
            className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg"
          >
            {loading ? "Saving..." : "Create"}
          </button>

        </div>

      </div>
    </div>
  );
}
