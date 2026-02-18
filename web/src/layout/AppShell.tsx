import * as React from "react";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="llAppShell">
      <Sidebar />
      <main className="llMain" role="main">
        {children}
      </main>
    </div>
  );
}
