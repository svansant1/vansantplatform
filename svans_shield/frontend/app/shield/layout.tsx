import { ShieldProvider } from "../components/shield/ShieldProvider";
import { ShieldShell } from "../components/shield/ShieldShell";

export default function ShieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShieldProvider>
      <ShieldShell>{children}</ShieldShell>
    </ShieldProvider>
  );
}
