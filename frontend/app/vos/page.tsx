import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  AppWindow,
  Bug,
  CheckCircle2,
  Download,
  FolderCode,
  Network,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
} from "lucide-react";
import { VosLaunchButton } from "./VosLaunchButton";

export const metadata: Metadata = {
  title: "VOS Founding Beta | Vansant Platform",
  description:
    "Download the Vansant Operating System founding beta for Windows and use the connected SV development and protection workspace.",
  alternates: { canonical: "https://vansantplatform.com/vos" },
  openGraph: {
    title: "Vansant Operating System",
    description: "One desktop. Every SV tool. Download the VOS Founding Beta for Windows.",
    url: "https://vansantplatform.com/vos",
    siteName: "Vansant Platform",
    images: [
      {
        url: "https://vansantplatform.com/vos-og.png",
        width: 1672,
        height: 941,
        alt: "Vansant Operating System Founding Beta",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vansant Operating System",
    description: "One desktop. Every SV tool. Download the VOS Founding Beta for Windows.",
    images: ["https://vansantplatform.com/vos-og.png"],
  },
};

const downloadUrl = "/downloads/VOS-Founding-Beta-0.15.0-Windows-Setup-R5.exe";
const checksumUrl = "/downloads/VOS-Founding-Beta-0.15.0-Windows-Setup-R5.exe.sha256";

const modules = [
  {
    name: "VOS Desktop",
    description: "A unified Windows workspace with files, notes, projects, tools, and managed app windows.",
    icon: SquareTerminal,
    accent: "text-violet-300",
  },
  {
    name: "VOS Sandbox",
    description: "The real desktop-grade coding workspace with file creation, terminals, running, and debugging.",
    icon: FolderCode,
    accent: "text-emerald-300",
  },
  {
    name: "SVANS Shield",
    description: "File scanning, quarantine review, integrity checks, and Guardian evidence reporting.",
    icon: ShieldCheck,
    accent: "text-rose-300",
  },
  {
    name: "SVANSAI Debugger",
    description: "Application and system diagnostics connected to the VOS incident workflow.",
    icon: Bug,
    accent: "text-purple-300",
  },
  {
    name: "SV Browser",
    description: "The Vansant browser with platform access and integrated safety and diagnostic tools.",
    icon: AppWindow,
    accent: "text-cyan-300",
  },
  {
    name: "Guardian + Network Armor",
    description: "Local coordination, health signals, incident evidence, and consent-based network posture visibility.",
    icon: Network,
    accent: "text-sky-300",
  },
];

const requirements = [
  "Windows 10 or Windows 11 (64-bit)",
  "Python 3.10 or newer for the VOS desktop layer",
  "Internet access during first-time setup",
  "Approximately 1 GB of available disk space",
];

export default function VosPage() {
  return (
    <div className="min-h-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#050711] text-white shadow-2xl">
      <section className="relative isolate overflow-hidden px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-20 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />

        <div className="relative grid items-center gap-12 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-violet-200">
              <Sparkles size={15} aria-hidden="true" />
              Founding Beta · Version 0.15.0
            </div>

            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              One desktop for the
              <span className="block bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
                Vansant ecosystem.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
              VOS brings your actual Sandbox, Shield, Debugger, SVANSAI tools,
              SV Browser, and Guardian services together in one Windows-hosted
              operating environment.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/vos/online"
                className="inline-flex items-center gap-3 rounded-2xl bg-white px-6 py-4 font-bold text-[#080b16] shadow-[0_0_40px_rgba(255,255,255,0.12)] transition hover:-translate-y-0.5 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                <MonitorPlay size={21} aria-hidden="true" />
                Explore VOS Online
              </Link>
              <VosLaunchButton />
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-4 font-bold text-white shadow-[0_0_40px_rgba(34,211,238,0.18)] transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                <Download size={21} aria-hidden="true" />
                Install VOS
              </a>
              <a
                href="#inside-vos"
                className="rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-4 font-bold transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                See what is included
              </a>
            </div>

            <p className="mt-5 text-sm text-zinc-500">
              Free founding beta · 4.7 MB installer · Windows 10/11 · Unsigned preview release
            </p>
            <a
              href={checksumUrl}
              download
              className="mt-2 inline-block text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-4 transition hover:text-zinc-300"
            >
              Download SHA-256 checksum
            </a>
          </div>

          <div className="relative mx-auto w-full max-w-[480px]">
            <div className="absolute inset-8 rounded-full bg-gradient-to-r from-violet-500/30 to-cyan-400/30 blur-3xl" />
            <div className="relative rounded-[2.25rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur">
              <Image
                src="/branding/vos-sv-logo.png"
                alt="SV Vansant Operating Systems logo"
                width={1254}
                height={1254}
                priority
                className="h-auto w-full rounded-[1.6rem]"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="inside-vos" className="border-y border-white/10 bg-white/[0.025] px-6 py-12 sm:px-10 lg:px-14">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">Inside VOS</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Real projects. One connected workspace.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-400">
            Setup installs the working Vansant builds registered with Guardian Core, not visual prototypes.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ name, description, icon: Icon, accent }) => (
            <article key={name} className="rounded-2xl border border-white/10 bg-black/25 p-6 transition hover:border-white/20 hover:bg-white/[0.04]">
              <Icon className={accent} size={28} aria-hidden="true" />
              <h3 className="mt-5 text-xl font-bold">{name}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-8 px-6 py-12 sm:px-10 lg:grid-cols-[1fr_0.9fr] lg:px-14">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 p-7 sm:p-9">
          <div className="flex items-center gap-3">
            <Bot className="text-violet-300" aria-hidden="true" />
            <h2 className="text-2xl font-black">Start using VOS</h2>
          </div>
          <ol className="mt-6 space-y-5 text-sm leading-6 text-zinc-300">
            <li className="flex gap-4"><span className="font-black text-cyan-300">01</span><span>Download and open the single <strong className="text-white">VOS Setup.exe</strong> file.</span></li>
            <li className="flex gap-4"><span className="font-black text-cyan-300">02</span><span>Select <strong className="text-white">Install and open VOS</strong>. Setup verifies the desktop requirements and downloads the real SV modules.</span></li>
            <li className="flex gap-4"><span className="font-black text-cyan-300">03</span><span>VOS opens automatically and remains available as <strong className="text-white">VOS Founding Beta</strong> in the Windows Start menu.</span></li>
          </ol>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/25 p-7 sm:p-9">
          <h2 className="text-2xl font-black">System requirements</h2>
          <ul className="mt-6 space-y-4">
            {requirements.map((requirement) => (
              <li key={requirement} className="flex gap-3 text-sm leading-6 text-zinc-300">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={19} aria-hidden="true" />
                {requirement}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-6 mb-12 rounded-3xl border border-amber-300/15 bg-amber-300/[0.06] p-6 sm:mx-10 lg:mx-14">
        <h2 className="font-bold text-amber-100">Founding-beta notice</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/70">
          VOS is an unsigned Windows-hosted beta, not a replacement for Windows and not yet a VPN. Windows may show a security warning. Keep normal Windows security enabled, review permissions before trusted code execution, and do not rely on VOS as your only protection layer.
        </p>
      </section>

      <footer className="flex flex-col gap-4 border-t border-white/10 px-6 py-7 text-sm text-zinc-500 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-14">
        <span>Vansant Operating Systems · Founding Beta 0.15.0</span>
        <div className="flex gap-5">
          <Link className="transition hover:text-white" href="/dashboard">Back to Platform</Link>
          <Link className="transition hover:text-white" href="/browser">SV Browser</Link>
        </div>
      </footer>
    </div>
  );
}
