"use client";

import Sidebar from "../../components/layout/sidebar";
import Topbar from "../../components/layout/topbar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh" }}>

      <Sidebar />

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        <Topbar />

        <div style={{ padding: 20 }}>
          {children}
        </div>

      </div>
    </div>
  );
}