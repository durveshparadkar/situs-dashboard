"use client";

import { useState } from "react";

// 🔥 Proper typing (no any, no warning)
type Props = {
  onCloseAction: () => void;
  onCreatedAction: (deal: unknown) => void;
};

export default function AddDealModal({
  onCloseAction,
  onCreatedAction,
}: Props) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("50");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!title || !value) return;

    setLoading(true);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          value: Number(value),
          probability: Number(probability),
        }),
      });

      const json = await res.json();

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
            disabled={loading}
            className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg"
          >
            {loading ? "Saving..." : "Create"}
          </button>

        </div>

      </div>
    </div>
  );
}