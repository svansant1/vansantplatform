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
} from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Sandbox", href: "/sandbox", icon: BrainCircuit },
  { name: "Debugger", href: "/debugger", icon: TerminalIcon },
  { name: "Shield", href: "/shield", icon: ShieldCheck },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="min-h-screen w-72 border-r border-zinc-800 bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 px-6 py-5">
        <h1 className="text-2xl font-bold tracking-wide">
          <span className="text-purple-400">Vansant</span>
          <span className="text-orange-400">Platform</span>
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
                  if (window.ipcRenderer) {
                    window.ipcRenderer.send("open-debugger");
                  } else {
                    window.location.href = item.href;
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  active
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
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
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
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
