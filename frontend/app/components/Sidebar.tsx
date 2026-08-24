"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  BrainCircuit,
  Settings,
  TerminalIcon,
  AppWindow,
  Bot,
  Orbit,
} from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "VOS", href: "/vos", icon: Orbit },
  { name: "SVANS-AI", href: "/svans-ai", icon: Bot },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Sandbox", href: "/sandbox", icon: BrainCircuit },
  { name: "Debugger", href: "/debugger", icon: TerminalIcon },
  { name: "Shield", href: "/shield", icon: ShieldCheck },
  { name: "SV Browser", href: "/browser", icon: AppWindow },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-40 w-full shrink-0 border-b border-[#17304a] bg-[#07101d]/95 text-white shadow-[0_14px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl md:min-h-screen md:w-72 md:border-b-0 md:border-r md:shadow-[18px_0_60px_rgba(0,0,0,0.22)]">
      <div className="border-b border-[#17304a] px-4 py-4 sm:px-6 md:px-6 md:py-5">
        <h1 className="text-xl font-bold tracking-wide sm:text-2xl">
          <span className="text-cyan-300">Vansant</span>
          <span className="text-blue-400">Platform</span>
        </h1>
        <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
          AI Development Operating System
        </p>
      </div>

      <nav className="flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] md:block md:space-y-2 md:overflow-visible md:p-4 [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          if (item.name === "Debugger") {
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  const w = window as typeof window & {
                    ipcRenderer?: {
                      send: (channel: string) => void;
                    };
                  };

                  if (w.ipcRenderer) {
                    w.ipcRenderer.send("open-debugger");
                  } else {
                    window.location.href = item.href;
                  }
                }}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition md:w-full md:gap-3 md:px-4 md:py-3 ${
                  active
                    ? "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[inset_3px_0_0_#00d4ff]"
                    : "border border-transparent text-zinc-300 hover:border-[#17304a] hover:bg-[#0b1626] hover:text-white"
                }`}
              >
                <Icon className="shrink-0" size={18} />
                <span className="whitespace-nowrap">{item.name}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition md:gap-3 md:px-4 md:py-3 ${
                active
                  ? "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[inset_3px_0_0_#00d4ff]"
                  : "border border-transparent text-zinc-300 hover:border-[#17304a] hover:bg-[#0b1626] hover:text-white"
              }`}
            >
              <Icon className="shrink-0" size={18} />
              <span className="whitespace-nowrap">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
