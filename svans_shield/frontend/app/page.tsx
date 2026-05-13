"use client";

import ShieldDashboardPage from "./shield/page";
import { ShieldProvider } from "./components/shield/ShieldProvider";
import { ShieldShell } from "./components/shield/ShieldShell";

export default function HomePage() {
  return (
    <ShieldProvider>
      <ShieldShell>
        <ShieldDashboardPage />
      </ShieldShell>
    </ShieldProvider>
  );
}
