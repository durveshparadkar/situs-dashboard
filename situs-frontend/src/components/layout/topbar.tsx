"use client";

import { useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Bell, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

import { apiFetch } from "@/lib/api";
import { generateAlerts, RevenueAlert } from "../../lib/alert-engine";

/* ================= PAGE TITLES ================= */

const pageTitles: Record<string, string> = {
 "/dashboard": "Dashboard",
 "/dashboard/deals": "Deals",
 "/dashboard/pipeline": "Pipeline",
 "/dashboard/leads": "Leads",
 "/dashboard/alerts": "Alerts",
 "/dashboard/analytics": "Analytics",
 "/dashboard/forecast": "Forecast",
 "/dashboard/settings": "Settings",
};

export default function Topbar() {
 const router = useRouter();
 const pathname = usePathname();

 const [open, setOpen] = useState(false);
 const [userOpen, setUserOpen] = useState(false);
 const [confirmOpen, setConfirmOpen] = useState(false);
 const [search, setSearch] = useState("");

 /* ================= DATA ================= */

 const leads = [
   {
     _id: "1",
     name: "Rahul Sharma",
     company: "TechCorp",
     value: 120000,
     status: "new" as const,
     createdAt: "2026-03-25",
   },
 ];

 const deals = [
   {
     _id: "1",
     title: "Enterprise SaaS Deal",
     value: 150000,
     probability: 30,
     stage: "negotiation",
     updatedAt: "2026-03-20",
   },
 ];

 const [alerts, setAlerts] = useState<RevenueAlert[]>(() =>
   generateAlerts(leads, deals)
 );

 const unreadCount = useMemo(
   () => alerts.filter((a) => a.status === "new").length,
   [alerts]
 );

 const pageTitle =
   Object.keys(pageTitles).find((p) => pathname.startsWith(p)) ||
   "/dashboard";

 /* ================= ALERT ACTIONS ================= */

 const markAsRead = (id: string) => {
   setAlerts((prev) =>
     prev.map((a) => (a.id === id ? { ...a, status: "resolved" } : a))
   );
 };

 const clearAll = () => {
   setAlerts((prev) => prev.map((a) => ({ ...a, status: "resolved" })));
   toast.success("All alerts cleared");
 };

 const handleAlertClick = (alert: RevenueAlert) => {
   markAsRead(alert.id);
   if (alert.entityId && alert.entityType) {
     router.push(
       `/dashboard/${alert.entityType}s?highlight=${alert.entityId}`
     );
     setOpen(false);
   }
 };

 /* ================= LOGOUT ================= */

 const handleLogout = async () => {
   setConfirmOpen(false);
   try {
     await apiFetch("/api/auth/logout", { method: "POST" });
   } catch {
     // best-effort — proceed regardless
   }
   toast.success("Logged out");
   window.location.href = "/login";
 };

 /* ================= GLOBAL ACTION ================= */

 const handleCreate = () => {
   if (pathname.includes("leads")) {
     router.push("/dashboard/leads?create=true");
   } else {
     router.push("/dashboard/deals?create=true");
   }
 };

 /* ================= UI ================= */

 return (
   <>
     <header className="h-16 w-full border-b bg-white flex items-center justify-between px-6">

       {/* LEFT */}
       <div className="flex items-center gap-6 flex-1 min-w-0">

         {/* DYNAMIC TITLE */}
         <div className="text-sm font-semibold text-slate-900 whitespace-nowrap">
           {pageTitles[pageTitle]}
         </div>

         {/* SEARCH */}
         <div className="relative flex items-center w-full max-w-md">
           <Search className="absolute left-3 w-4 h-4 text-slate-400" />
           <input
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             placeholder="Search deals, leads..."
             className="w-full pl-9 pr-12 py-2 text-sm bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-slate-300"
           />
           <span className="absolute right-3 text-[11px] text-slate-400 border rounded px-1.5 py-0.5">
             ⌘K
           </span>
         </div>

       </div>

       {/* RIGHT */}
       <div className="flex items-center gap-3">

         {/* GLOBAL CREATE */}
         <button
           onClick={handleCreate}
           className="flex items-center gap-2 text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition"
         >
           <Plus size={14} />
           Create
         </button>

         {/* ALERTS */}
         <div className="relative">
           <button
             onClick={() => setOpen((p) => !p)}
             className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500"
           >
             <Bell size={18} />
             {unreadCount > 0 && (
               <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1.5 rounded-full">
                 {unreadCount}
               </span>
             )}
           </button>

           <AnimatePresence>
             {open && (
               <motion.div
                 initial={{ opacity: 0, y: 6 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: 6 }}
                 className="absolute right-0 mt-2 w-80 bg-white border rounded-xl shadow-lg z-50 overflow-hidden"
               >
                 <div className="flex items-center justify-between px-4 py-3 border-b">
                   <span className="text-sm font-semibold">Alerts</span>
                   {unreadCount > 0 && (
                     <button
                       onClick={clearAll}
                       className="text-xs text-slate-500 hover:text-black"
                     >
                       Clear all
                     </button>
                   )}
                 </div>

                 <div className="max-h-80 overflow-y-auto">
                   {alerts.length === 0 ? (
                     <p className="p-6 text-sm text-slate-500 text-center">
                       No alerts
                     </p>
                   ) : (
                     alerts.map((alert) => (
                       <div
                         key={alert.id}
                         onClick={() => handleAlertClick(alert)}
                         className={`px-4 py-3 border-b cursor-pointer ${
                           alert.status === "new" ? "bg-slate-50" : "bg-white"
                         } hover:bg-slate-100`}
                       >
                         <p className="text-sm font-medium">{alert.title}</p>
                         <p className="text-xs text-slate-500 mt-1">
                           {alert.message}
                         </p>
                       </div>
                     ))
                   )}
                 </div>
               </motion.div>
             )}
           </AnimatePresence>
         </div>

         {/* USER AVATAR + DROPDOWN */}
         <div className="relative">
           <button
             onClick={() => setUserOpen((p) => !p)}
             className="h-8 w-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-semibold"
           >
             D
           </button>

           <AnimatePresence>
             {userOpen && (
               <motion.div
                 initial={{ opacity: 0, y: 6 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: 6 }}
                 className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-50 overflow-hidden"
               >
                 <div className="px-4 py-3 border-b">
                   <p className="text-xs font-semibold text-slate-900">Durvesh</p>
                   <p className="text-xs text-slate-400 mt-0.5">Admin</p>
                 </div>

                 <button
                   onClick={() => {
                     setUserOpen(false);
                     setConfirmOpen(true);
                   }}
                   className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-slate-100"
                 >
                   Logout
                 </button>
               </motion.div>
             )}
           </AnimatePresence>
         </div>

       </div>
     </header>

     {/* LOGOUT CONFIRMATION MODAL */}
     <AnimatePresence>
       {confirmOpen && (
         <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
           onClick={() => setConfirmOpen(false)}
         >
           <motion.div
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.95 }}
             onClick={(e) => e.stopPropagation()}
             className="bg-white rounded-xl shadow-xl p-6 w-80"
           >
             <p className="text-sm font-semibold text-slate-900">Log out?</p>
             <p className="text-xs text-slate-500 mt-1">
               You&apos;ll be redirected to the login page.
             </p>

             <div className="flex gap-2 mt-5">
               <button
                 onClick={() => setConfirmOpen(false)}
                 className="flex-1 text-sm px-4 py-2 rounded-lg border hover:bg-slate-50 text-slate-600"
               >
                 Cancel
               </button>
               <button
                 onClick={handleLogout}
                 className="flex-1 text-sm px-4 py-2 rounded-lg bg-black text-white hover:bg-slate-800"
               >
                 Logout
               </button>
             </div>
           </motion.div>
         </motion.div>
       )}
     </AnimatePresence>
   </>
 );
}