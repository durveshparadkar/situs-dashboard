"use client";

import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/30">

      <div className="w-full max-w-xl bg-white rounded-xl shadow-lg border">

        {/* Header */}
        <div className="flex items-center border-b px-4 h-12">
          <input
            autoFocus
            placeholder="Search or run a command..."
            className="flex-1 outline-none text-sm"
          />

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="p-2 text-sm">

          <div className="px-3 py-2 text-xs text-gray-500">
            Actions
          </div>

          <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
            Create Deal
          </button>

          <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
            Create Contact
          </button>

          <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
            Go to Pipeline
          </button>

          <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
            Go to Analytics
          </button>

        </div>

      </div>
    </div>
  );
}