"use client";

import { AnimatePresence, motion as m } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

interface DrawerShellProps {
  /** Whether the drawer is visible */
  open: boolean;
  /** Called when overlay clicked, X pressed, or Escape hit */
  onClose: () => void;
  /** Large title — usually the entity name (e.g. "Acme Enterprise") */
  title: string;
  /** Small subtitle under the title (e.g. "Deal Intelligence") */
  subtitle?: string;
  /** Optional icon shown in the rounded square beside the title */
  icon?: ReactNode;
  /** Scrollable main body content */
  children: ReactNode;
  /** Sticky footer — usually primary + secondary action buttons */
  footer?: ReactNode;
  /** Width of the drawer — defaults to max-w-md (448px) */
  widthClassName?: string;
}

/**
 * DrawerShell — the shared right-side drawer used by Deal & Lead drawers.
 *
 * Handles: overlay + blur, slide-in animation, escape key, click-outside close,
 * sticky header, scrollable body, sticky footer.
 *
 * Compose any content inside via children.
 */
export default function DrawerShell({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  widthClassName = "max-w-md",
}: DrawerShellProps) {
  /* Escape to close */
  useEffect(
    function () {
      if (!open) return;
      function handler(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
      }
      window.addEventListener("keydown", handler);
      return function () {
        window.removeEventListener("keydown", handler);
      };
    },
    [open, onClose]
  );

  /* Prevent body scroll while drawer is open */
  useEffect(
    function () {
      if (!open) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return function () {
        document.body.style.overflow = prev;
      };
    },
    [open]
  );

  const panelClassName =
    "relative ml-auto w-full " +
    widthClassName +
    " h-full bg-white border-l border-black/[0.06] shadow-[-16px_0_48px_-24px_rgba(0,0,0,0.18)] flex flex-col pointer-events-auto";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex pointer-events-none">
          {/* Overlay */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-900/30 backdrop-blur-[2px] pointer-events-auto"
          />

          {/* Panel */}
          <m.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.4, ease: EASE }}
            className={panelClassName}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            {/* HEADER */}
            <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-black/[0.05]">
              <div className="flex items-center gap-3 min-w-0">
                {icon && (
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-50 ring-1 ring-black/[0.06] shrink-0">
                    {icon}
                  </div>
                )}
                <div className="min-w-0">
                  {subtitle && (
                    <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                      {subtitle}
                    </div>
                  )}
                  <h3
                    id="drawer-title"
                    className="text-[16px] font-semibold text-zinc-900 truncate tracking-tight"
                  >
                    {title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </header>

            {/* BODY (scrollable) */}
            <div className="flex-1 overflow-y-auto">{children}</div>

            {/* FOOTER */}
            {footer && (
              <footer className="px-6 py-4 border-t border-black/[0.05] bg-zinc-50/40">
                {footer}
              </footer>
            )}
          </m.aside>
        </div>
      )}
    </AnimatePresence>
  );
}