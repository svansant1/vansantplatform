import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import SVANSCompanion from "./components/SVANSCompanion";

export const metadata: Metadata = {
  title: "VansantPlatform",
  description: "AI builder platform for future systems",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="bg-[#050a12] text-[#e8f4ff]"
        style={{ backgroundColor: "#050a12", color: "#e8f4ff" }}
      >
        <div className="flex min-h-screen flex-col bg-[#050a12] md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_85%_0%,rgba(0,212,255,0.08),transparent_26rem),linear-gradient(135deg,#050a12,#07111f)] px-4 py-5 sm:px-6 md:p-8">
            {children}
          </main>
        </div>
        <SVANSCompanion />
      </body>
    </html>
  );
}
