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
    <aside className="min-h-screen w-72 border-r border-[#17304a] bg-[#07101d]/95 text-white shadow-[18px_0_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="border-b border-[#17304a] px-6 py-5">
        <h1 className="text-2xl font-bold tracking-wide">
          <span className="text-cyan-300">Vansant</span>
          <span className="text-blue-400">Platform</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          AI Development Operating System
        </p>
      </div>

      <nav className="space-y-2 p-4">
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
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  active
                    ? "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[inset_3px_0_0_#00d4ff]"
                    : "border border-transparent text-zinc-300 hover:border-[#17304a] hover:bg-[#0b1626] hover:text-white"
                }`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                active
                  ? "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[inset_3px_0_0_#00d4ff]"
                  : "border border-transparent text-zinc-300 hover:border-[#17304a] hover:bg-[#0b1626] hover:text-white"
              }`}
            >
              <Icon size={18} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
