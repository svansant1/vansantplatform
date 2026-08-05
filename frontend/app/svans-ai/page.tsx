import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Download,
  Eye,
  FileSearch,
  FolderOpen,
  Image as ImageIcon,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
} from "lucide-react";

export const metadata: Metadata = {
  title: "SVANS-AI Desktop | Vansant Platform",
  description:
    "Open SVANS-AI as a Vansant Platform app for teaching, coding, workspace analysis, memory, and permissioned desktop assistance.",
  alternates: { canonical: "https://vansantplatform.com/svans-ai" },
  openGraph: {
    title: "SVANS-AI Desktop",
    description:
      "The AI command center for the Vansant ecosystem: teaching, coding, files, folders, images, memory, and platform coordination.",
    url: "https://vansantplatform.com/svans-ai",
    siteName: "Vansant Platform",
    images: [
      {
        url: "https://vansantplatform.com/mascots/sv-robot.png",
        width: 1024,
        height: 1024,
        alt: "SVANS-AI mascot",
      },
    ],
    type: "website",
  },
};

const webAppUrl = "https://svansai-frontend.onrender.com";
const installerUrl = "";

const capabilities = [
  {
    name: "Teaching + question solving",
    description:
      "Handles school questions, coding exercises, discussion posts, and guided explanations without weak fallback replies.",
    icon: MessageSquareText,
    accent: "text-cyan-300",
  },
  {
    name: "Desktop workspace bridge",
    description:
      "Permission-based folder access, file reading, project summaries, search, and safe write previews inside trusted workspaces.",
    icon: FolderOpen,
    accent: "text-violet-300",
  },
  {
    name: "Code and terminal support",
    description:
      "Runs approved commands, checks Git status, previews patches, and coordinates with Sandbox and Debugger workflows.",
    icon: SquareTerminal,
    accent: "text-emerald-300",
  },
  {
    name: "Images, OCR, and files",
    description:
      "Supports image analysis, OCR-ready workflows, file cards, and future image generation/editing inside the AI command center.",
    icon: ImageIcon,
    accent: "text-pink-300",
  },
  {
    name: "SVANS-Mind memory",
    description:
      "Remembers useful preferences, writing style, active projects, corrections, and task context while filtering noise.",
    icon: BrainCircuit,
    accent: "text-blue-300",
  },
  {
    name: "Shielded permissions",
    description:
      "Keeps local access visible, logged, reversible, and separated between read-only and trusted workspace actions.",
    icon: ShieldCheck,
    accent: "text-rose-300",
  },
];

const installSteps = [
  "Open the SVANS-AI app page from VansantPlatform.",
  "Use the web app now, or install the Windows desktop build when the signed installer is published.",
  "Grant folder access only when you want SVANS-AI to inspect a specific local workspace.",
  "Review every write, command, commit, push, or deployment before approval.",
];

export default function SvansAiPage() {
  const installerReady = Boolean(installerUrl);

  return (
    <div className="min-h-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#050711] text-white shadow-2xl">
      <section className="relative isolate overflow-hidden px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div className="pointer-events-none absolute -left-28 top-10 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-28 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />

        <div className="relative grid items-center gap-12 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">
              <Sparkles size={15} aria-hidden="true" />
              SVANS-AI App · Desktop Command Center
            </div>

            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              The AI command center for
              <span className="block bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">
                Vansant Platform.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
              SVANS-AI is now treated like the other Vansant apps instead of a
              loose ZIP download. The web app stays available immediately, and
              the desktop build is staged here for the Windows installer once
              the package is small enough to ship safely.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <a
                href={webAppUrl}
                className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-4 font-bold text-white shadow-[0_0_40px_rgba(34,211,238,0.18)] transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                <Bot size={21} aria-hidden="true" />
                Open SVANS-AI
              </a>

              {installerReady ? (
                <a
                  href={installerUrl}
                  download
                  className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-4 font-bold transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                  <Download size={21} aria-hidden="true" />
                  Install Desktop App
                </a>
              ) : (
                <div className="inline-flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] px-6 py-4 font-bold text-amber-100">
                  <Download size={21} aria-hidden="true" />
                  Desktop installer coming next
                </div>
              )}

              <a
                href="#capabilities"
                className="rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-4 font-bold transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                See capabilities
              </a>
            </div>

            <p className="mt-5 text-sm text-zinc-500">
              Web app available now · Windows desktop build staged · Installer
              packaging in progress
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[460px]">
            <div className="absolute inset-8 rounded-full bg-gradient-to-r from-cyan-500/30 to-violet-400/30 blur-3xl" />
            <div className="relative rounded-[2.25rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur">
              <Image
                src="/mascots/sv-robot.png"
                alt="SVANS-AI robot mascot"
                width={1024}
                height={1024}
                priority
                className="mx-auto h-auto w-full max-w-[360px] object-contain drop-shadow-[0_0_45px_rgba(34,211,238,0.18)]"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="capabilities"
        className="border-y border-white/10 bg-white/[0.025] px-6 py-12 sm:px-10 lg:px-14"
      >
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">
              Inside SVANS-AI
            </p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">
              Built as a real platform app.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-400">
            The desktop version is meant to add local permissions, project
            tools, workspace auditing, and deeper Vansant app coordination on
            top of the online SVANS-AI chat experience.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map(({ name, description, icon: Icon, accent }) => (
            <article
              key={name}
              className="rounded-2xl border border-white/10 bg-black/25 p-6 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <Icon className={accent} size={28} aria-hidden="true" />
              <h3 className="mt-5 text-xl font-bold">{name}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-8 px-6 py-12 sm:px-10 lg:grid-cols-[1fr_0.9fr] lg:px-14">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 p-7 sm:p-9">
          <div className="flex items-center gap-3">
            <FileSearch className="text-cyan-300" aria-hidden="true" />
            <h2 className="text-2xl font-black">How this app should work</h2>
          </div>
          <ol className="mt-6 space-y-5 text-sm leading-6 text-zinc-300">
            {installSteps.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span className="font-black text-cyan-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/25 p-7 sm:p-9">
          <div className="flex items-center gap-3">
            <LockKeyhole className="text-violet-300" aria-hidden="true" />
            <h2 className="text-2xl font-black">Permission model</h2>
          </div>
          <ul className="mt-6 space-y-4">
            {[
              "No local access by default",
              "Read-only folder access when selected",
              "Trusted workspace mode only after approval",
              "Audit trail for reads, writes, commands, and Git checks",
              "Owner approval before commits, pushes, deployments, or risky commands",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-zinc-300">
                <CheckCircle2
                  className="mt-0.5 shrink-0 text-emerald-300"
                  size={19}
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-6 mb-12 rounded-3xl border border-amber-300/15 bg-amber-300/[0.06] p-6 sm:mx-10 lg:mx-14">
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 shrink-0 text-amber-200" aria-hidden="true" />
          <div>
            <h2 className="font-bold text-amber-100">Download status</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/70">
              The old ZIP download was removed because the desktop package was
              too large for GitHub and Render. This page keeps SVANS-AI listed
              as a real VansantPlatform app while the Windows installer is
              packaged the same way as Sandbox, Debugger, Shield, Browser, and
              VOS.
            </p>
          </div>
        </div>
      </section>

      <footer className="flex flex-col gap-4 border-t border-white/10 px-6 py-7 text-sm text-zinc-500 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-14">
        <span>SVANS-AI Desktop · Vansant Platform app</span>
        <div className="flex gap-5">
          <Link className="transition hover:text-white" href="/dashboard">
            Back to Platform
          </Link>
          <Link className="transition hover:text-white" href="/vos">
            VOS
          </Link>
        </div>
      </footer>
    </div>
  );
}
