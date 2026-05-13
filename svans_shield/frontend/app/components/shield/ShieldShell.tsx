"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

const navItems = [
  { label: "Dashboard", href: "/shield" },
  { label: "Scan", href: "/shield/scan" },
  { label: "Findings", href: "/shield/findings" },
  { label: "Quarantine", href: "/shield/quarantine" },
  { label: "Settings", href: "/shield/settings" },
];

export function ShieldShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#050711] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-white/10 bg-black/30 p-6 lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-purple-600 shadow-lg shadow-purple-900/40">
              <Image
                src="/shield-mascot.png"
                alt="SVANS Shield"
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            </div>

            <div>
              <h1 className="text-lg font-bold">SVANS Shield</h1>
              <p className="text-xs text-zinc-500">Local Protection Engine</p>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            {navItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-4 py-3 transition ${
                    active
                      ? "bg-purple-600/20 text-purple-200"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-10 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
            <p className="text-sm font-semibold text-purple-200">
              MVP Protection
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              SVANS Shield analyzes suspicious traits and explains findings
              before quarantine.
            </p>
          </div>
        </aside>

        <section className="w-full px-4 py-6 md:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
