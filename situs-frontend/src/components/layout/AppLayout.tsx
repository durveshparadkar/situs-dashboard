import { ReactNode } from "react";

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div style={{ width: "100%", minHeight: "100vh" }}>
      {children}
    </div>
  );
}