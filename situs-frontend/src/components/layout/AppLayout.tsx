import { ReactNode } from "react";

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      
      {/* GLOBAL APP WRAPPER */}
      <div className="flex flex-col min-h-screen">
        
        {/* PAGE CONTENT */}
        <main className="flex-1">
          {children}
        </main>

      </div>
    </div>
  );
}