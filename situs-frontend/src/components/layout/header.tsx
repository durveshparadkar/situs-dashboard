"use client";

import CommandSearch from "../header/command-search";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Header() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  /* ✅ stable auth check */
  const isLoggedIn = useMemo(() => {
    if (typeof document === "undefined") return false;
    return document.cookie.includes("token=");
  }, []);

  const handleLogout = () => {
    document.cookie = "token=; Max-Age=0; path=/";
    localStorage.removeItem("token");
    router.push("/login");
  };

  return (
    <header className="h-16 w-full border-b bg-white flex items-center justify-between px-6">

      {/* LEFT (BRAND) */}
      <div
        onClick={() => router.push("/")}
        className="cursor-pointer"
      >
        <p className="text-sm font-semibold text-slate-900">
          Situs
        </p>
        <p className="text-[11px] text-slate-400">
          Revenue OS
        </p>
      </div>

      {/* CENTER (SEARCH) */}
      <div className="flex-1 flex justify-center px-6">
        <div className="w-full max-w-md">
          <CommandSearch />
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-3 relative">

        {/* NOTIFICATIONS */}
        <button className="p-2 rounded-lg hover:bg-slate-100 transition">
          <Bell className="w-5 h-5 text-slate-500" />
        </button>

        {/* AUTH */}
        {isLoggedIn ? (
          <div className="relative">
            <button
              onClick={() => setOpen((p) => !p)}
              className="h-8 w-8 rounded-full bg-black text-white text-xs font-semibold flex items-center justify-center"
            >
              D
            </button>

            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute right-0 mt-2 w-44 bg-white border rounded-xl shadow-lg overflow-hidden z-50"
                >
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Dashboard
                  </button>

                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <button
              onClick={() => router.push("/login")}
              className="text-sm text-slate-600 hover:text-black"
            >
              Login
            </button>

            <button
              onClick={() => router.push("/signup")}
              className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition"
            >
              Get Started
            </button>
          </>
        )}
      </div>
    </header>
  );
}