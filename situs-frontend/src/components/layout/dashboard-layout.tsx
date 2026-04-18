"use client";

import { motion } from "framer-motion";
import Sidebar from "./sidebar";
import Topbar from "./topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "#f8fafc", overflow: "hidden" }}>

      {/* SIDEBAR */}
      <Sidebar />

      {/* RIGHT SIDE */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>

        {/* TOPBAR */}
        <Topbar />

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, overflowY: "auto" }}>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{ width: "100%", padding: "32px" }}
          >
            <div style={{ maxWidth: 1280, margin: "0 auto", width: "100%" }}>
              {children}
            </div>
          </motion.div>
        </main>

      </div>
    </div>
  );
}