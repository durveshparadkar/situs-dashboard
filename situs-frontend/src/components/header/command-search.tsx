"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import CommandPalette from "./command-palette";

export default function CommandSearch() {
  const [open, setOpen] = useState(false);

  // Keyboard shortcut (Ctrl + K / Cmd + K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <div className="flex-1 flex justify-center">
        <div
          onClick={() => setOpen(true)}
          className="relative w-full max-w-xl cursor-text"
        >
          {/* Search Icon */}
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />

          {/* Input */}
          <input
            readOnly
            placeholder="Search deals, contacts, companies..."
            className="
              w-full
              h-10
              pl-9
              pr-16
              text-sm
              bg-gray-50
              border
              border-gray-200
              rounded-lg
              outline-none
              transition
              focus:bg-white
              focus:border-gray-400
            "
          />

          {/* Keyboard Shortcut */}
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-2 py-0.5">
            Ctrl K
          </kbd>
        </div>
      </div>

      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}