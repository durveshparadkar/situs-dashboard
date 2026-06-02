"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Sidebar from "./sidebar";
import Topbar from "./topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  /* ================= AUTH ================= */

  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = () => {
      const hasToken =
        typeof document !== "undefined" &&
        document.cookie.includes("token=");

      if (!hasToken) {
        router.replace("/login");
      } else {
        setAuthorized(true);
      }
    };

    const id = setTimeout(checkAuth, 0);
    return () => clearTimeout(id);
  }, [router]);

  if (authorized === null) return null;

  /* ================= UI ================= */

  return (
    <div className="flex h-screen w-full overflow-hidden">

      {/* SIDEBAR */}
      <Sidebar />

      {/* RIGHT SIDE */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* TOPBAR */}
        <Topbar />

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto">

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-full px-6 py-6 md:px-8 md:py-8"
          >
            <div className="max-w-7xl mx-auto w-full">
              {children}
            </div>
          </motion.div>

        </main>
      </div>
    </div>
  );
}