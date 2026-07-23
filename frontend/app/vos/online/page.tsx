import type { Metadata } from "next";
import { VosOnlineDesktop } from "./VosOnlineDesktop";

export const metadata: Metadata = {
  title: "Explore VOS Online | Vansant Platform",
  description:
    "Try the Vansant Operating System desktop and web-safe SV tools before installing the full Windows edition.",
  alternates: { canonical: "https://vansantplatform.com/vos/online" },
};

export default function VosOnlinePage() {
  return <VosOnlineDesktop />;
}
