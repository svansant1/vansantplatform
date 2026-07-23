"use client";

import Link from "next/link";
import {
  AppWindow,
  Bot,
  Bug,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  Files,
  FolderKanban,
  Globe2,
  Maximize2,
  Minus,
  Network,
  NotebookPen,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AppId =
  | "files"
  | "notes"
  | "calculator"
  | "sandbox"
  | "shield"
  | "debugger"
  | "guardian"
  | "network"
  | "guide"
  | "browser"
  | "projects"
  | "settings";

type PreviewApp = {
  id: AppId;
  name: string;
  shortName: string;
  icon: LucideIcon;
  color: string;
  localOnly?: boolean;
};

const apps: PreviewApp[] = [
  { id: "files", name: "Files", shortName: "Files", icon: Files, color: "bg-blue-500" },
  { id: "notes", name: "Notes", shortName: "Notes", icon: NotebookPen, color: "bg-amber-500" },
  { id: "calculator", name: "Calculator", shortName: "Calculator", icon: Calculator, color: "bg-emerald-500" },
  { id: "guide", name: "SVANSAI Guide", shortName: "Guide", icon: Bot, color: "bg-violet-600" },
  { id: "sandbox", name: "VOS Sandbox", shortName: "Sandbox", icon: Code2, color: "bg-green-500", localOnly: true },
  { id: "shield", name: "SVANS Shield", shortName: "Shield", icon: ShieldCheck, color: "bg-rose-500", localOnly: true },
  { id: "debugger", name: "SVANSAI Debugger", shortName: "Debugger", icon: Bug, color: "bg-purple-500", localOnly: true },
  { id: "guardian", name: "Guardian Core", shortName: "Guardian", icon: ShieldCheck, color: "bg-teal-600" },
  { id: "network", name: "Network Armor", shortName: "Network", icon: Network, color: "bg-sky-600", localOnly: true },
  { id: "projects", name: "Projects", shortName: "Projects", icon: FolderKanban, color: "bg-cyan-500" },
  { id: "settings", name: "Settings", shortName: "Settings", icon: Settings, color: "bg-slate-500" },
  { id: "browser", name: "SV Browser", shortName: "Browser", icon: Globe2, color: "bg-sky-500" },
];

const appById = Object.fromEntries(apps.map((app) => [app.id, app])) as Record<AppId, PreviewApp>;

const virtualFiles = {
  "welcome.md": "# Welcome to VOS Online\n\nExplore the Vansant desktop before installing the full Windows edition.",
  "sandbox-example.py": 'print("Hello from the VOS Sandbox")\n2 + 3',
  "shield-report.txt": "Preview scan result\n0 critical threats\n2 educational warnings",
  "project-plan.md": "1. Explore VOS Online\n2. Install VOS\n3. Pair with Vansant Platform\n4. Build with the full SV toolset",
};

function calculate(expression: string): string {
  if (!expression || !/^[0-9+\-*/().\s]+$/.test(expression)) return "Error";
  try {
    const value = Function(`"use strict"; return (${expression})`)();
    return Number.isFinite(value) ? String(value) : "Error";
  } catch {
    return "Error";
  }
}

function runGuidedCode(source: string): string {
  const output: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const printMatch = trimmed.match(/^print\((["'])(.*)\1\)$/);
    const mathMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
    if (printMatch) output.push(printMatch[2]);
    else if (mathMatch) {
      const [, left, operator, right] = mathMatch;
      output.push(calculate(`${left}${operator}${right}`));
    } else if (trimmed && !trimmed.startsWith("#")) {
      output.push(`Preview skipped unsupported line: ${trimmed}`);
    }
  }
  return output.length ? output.join("\n") : "Nothing to run. Try print(\"Hello VOS\") or 2 + 3.";
}

export function VosOnlineDesktop() {
  const [openApps, setOpenApps] = useState<AppId[]>([]);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [notes, setNotes] = useState("Ideas for my Vansant workspace:\n\n• Explore the SV tools\n• Try the guided Sandbox\n• Install VOS when ready");
  const [selectedFile, setSelectedFile] = useState<keyof typeof virtualFiles>("welcome.md");
  const [expression, setExpression] = useState("24 * 7");
  const [sandboxCode, setSandboxCode] = useState('print("Hello from VOS Online")\n2 + 3');
  const [sandboxOutput, setSandboxOutput] = useState("Select Run preview to see safe guided output.");
  const [scanState, setScanState] = useState<"idle" | "scanning" | "complete">("idle");
  const [debugState, setDebugState] = useState<"idle" | "running" | "complete">("idle");
  const [guideQuestion, setGuideQuestion] = useState("");
  const [guideAnswer, setGuideAnswer] = useState("Ask what Guardian, Shield, Sandbox, or the full installation does.");
  const [browserAddress, setBrowserAddress] = useState("vansantplatform.com");
  const [browserPage, setBrowserPage] = useState<"home" | "vos" | "shield">("home");

  useEffect(() => {
    const saved = window.localStorage.getItem("vos-online-notes");
    if (saved) setNotes(saved);
    const hash = window.location.hash.replace("#", "") as AppId;
    if (hash in appById) {
      setOpenApps([hash]);
      setActiveApp(hash);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vos-online-notes", notes);
  }, [notes]);

  const active = activeApp ? appById[activeApp] : null;
  const clock = useMemo(
    () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()),
    [],
  );

  function openApp(id: AppId) {
    setOpenApps((current) => (current.includes(id) ? current : [...current, id]));
    setActiveApp(id);
    setMaximized(false);
    setStartOpen(false);
  }

  function closeApp(id: AppId) {
    setOpenApps((current) => current.filter((item) => item !== id));
    setActiveApp((current) => {
      if (current !== id) return current;
      const remaining = openApps.filter((item) => item !== id);
      return remaining.at(-1) ?? null;
    });
    setMaximized(false);
  }

  function runScan() {
    setScanState("scanning");
    window.setTimeout(() => setScanState("complete"), 1100);
  }

  function runDebugger() {
    setDebugState("running");
    window.setTimeout(() => setDebugState("complete"), 1200);
  }

  function askGuide() {
    const question = guideQuestion.toLowerCase();
    if (question.includes("shield")) setGuideAnswer("Shield demonstrates file scanning and findings here. The installed edition can inspect selected local files and manage quarantine.");
    else if (question.includes("sandbox")) setGuideAnswer("The online Sandbox runs only a small guided language. Install VOS for real project files, terminals, Git, running, and debugging.");
    else if (question.includes("guardian")) setGuideAnswer("Guardian coordinates trusted VOS modules, health, evidence, and incidents. This preview shows its module dashboard without controlling your computer.");
    else setGuideAnswer("VOS Online is the safe showroom. Install and pair VOS when you want local files, real SV apps, Git, terminals, Guardian, and system diagnostics.");
  }

  function navigateBrowser() {
    const address = browserAddress.toLowerCase();
    if (address.includes("shield")) setBrowserPage("shield");
    else if (address.includes("vos")) setBrowserPage("vos");
    else setBrowserPage("home");
  }

  function renderApp(id: AppId) {
    switch (id) {
      case "files":
        return (
          <div className="grid h-full min-h-0 grid-cols-[190px_1fr]">
            <div className="border-r border-white/10 bg-[#0b1222] p-3">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Preview files</p>
              {(Object.keys(virtualFiles) as Array<keyof typeof virtualFiles>).map((file) => (
                <button key={file} onClick={() => setSelectedFile(file)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${selectedFile === file ? "bg-blue-500/20 text-blue-200" : "text-slate-300 hover:bg-white/5"}`}>
                  <FileText size={15} /> {file}
                </button>
              ))}
            </div>
            <div className="min-w-0 bg-[#070b14] p-5">
              <p className="mb-3 text-xs text-slate-500">VOS Online / {selectedFile}</p>
              <pre className="whitespace-pre-wrap font-mono text-sm leading-7 text-slate-200">{virtualFiles[selectedFile]}</pre>
            </div>
          </div>
        );
      case "notes":
        return <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="h-full min-h-[340px] w-full resize-none bg-[#fff9dc] p-6 text-base leading-7 text-slate-800 outline-none" aria-label="VOS preview notes" />;
      case "calculator":
        return (
          <div className="mx-auto max-w-sm p-6">
            <input value={expression} onChange={(event) => setExpression(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 p-4 text-right font-mono text-2xl outline-none focus:border-emerald-400" aria-label="Calculator expression" />
            <div className="mt-4 grid grid-cols-4 gap-2">
              {["7","8","9","/","4","5","6","*","1","2","3","-","0",".","(",")"].map((key) => (
                <button key={key} onClick={() => setExpression((value) => value + key)} className="rounded-xl bg-white/5 p-3 font-bold hover:bg-white/10">{key}</button>
              ))}
              <button onClick={() => setExpression("")} className="col-span-2 rounded-xl bg-rose-500/15 p-3 text-rose-200">Clear</button>
              <button onClick={() => setExpression(calculate(expression))} className="col-span-2 rounded-xl bg-emerald-500 p-3 font-bold text-white">= Calculate</button>
            </div>
          </div>
        );
      case "sandbox":
        return (
          <div className="grid h-full min-h-[420px] grid-rows-[auto_1fr_150px] bg-[#070a10]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div><p className="font-bold">Guided Sandbox</p><p className="text-xs text-amber-300">Preview mode · no local execution</p></div>
              <button onClick={() => setSandboxOutput(runGuidedCode(sandboxCode))} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold"><Play size={15} /> Run preview</button>
            </div>
            <textarea value={sandboxCode} onChange={(event) => setSandboxCode(event.target.value)} className="min-h-0 resize-none bg-[#0d1117] p-5 font-mono text-sm leading-7 text-emerald-200 outline-none" spellCheck={false} />
            <pre className="overflow-auto border-t border-white/10 bg-black p-4 font-mono text-sm text-slate-300">{sandboxOutput}</pre>
          </div>
        );
      case "shield":
        return (
          <div className="p-6">
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
              <div className="flex items-center gap-4"><div className="rounded-2xl bg-rose-500 p-4"><ShieldCheck /></div><div><h3 className="text-xl font-black">SVANS Shield Preview</h3><p className="text-sm text-slate-400">Demonstration data only</p></div></div>
              <button onClick={runScan} disabled={scanState === "scanning"} className="mt-6 rounded-xl bg-rose-500 px-5 py-3 font-bold disabled:opacity-60">{scanState === "scanning" ? "Scanning preview…" : "Run sample scan"}</button>
            </div>
            {scanState === "complete" && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4"><CheckCircle2 className="text-emerald-300" /> No critical threats in the sample workspace</div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-amber-100">2 educational warnings: unsigned preview app and stale test dependency</div>
              </div>
            )}
          </div>
        );
      case "debugger":
        return (
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-xl font-black">SVANSAI Debugger</h3><p className="text-sm text-slate-400">Sample application diagnostic</p></div><button onClick={runDebugger} className="rounded-xl bg-purple-500 px-5 py-3 font-bold">{debugState === "running" ? "Analyzing…" : "Run diagnosis"}</button></div>
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4"><span className="text-emerald-300">PASS</span> Web interface loaded successfully</div>
              {debugState !== "idle" && <div className="rounded-xl border border-white/10 bg-black/20 p-4"><span className="text-emerald-300">PASS</span> Vansant API reachable</div>}
              {debugState === "complete" && <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><span className="text-amber-300">GUIDANCE</span> Install VOS to inspect local processes, logs, applications, and networks.</div>}
            </div>
          </div>
        );
      case "guardian":
        return (
          <div className="p-6">
            <div className="flex items-center gap-3 text-emerald-300"><span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_16px_#34d399]" /><strong>Guardian Preview Online</strong></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["VOS Desktop","SVANSAI Guide","VOS Sandbox","SVANS Shield","SVANSAI Debugger","SV Browser","Network Armor"].map((module) => <div key={module} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4"><span>{module}</span><span className="text-xs text-emerald-300">available</span></div>)}
            </div>
            <p className="mt-5 text-sm text-slate-400">The installed Guardian adds authenticated local coordination, evidence, incidents, and module controls.</p>
          </div>
        );
      case "network":
        return (
          <div className="p-6">
            <h3 className="text-xl font-black">Network Armor Preview</h3>
            <p className="mt-2 text-sm text-slate-400">No device network information is collected in the online preview.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[["Firewall","Protected"],["DNS posture","Normal"],["Open risks","0 sample"],["Guardian link","Preview"]].map(([label,value]) => <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-lg font-bold text-sky-300">{value}</p></div>)}
            </div>
          </div>
        );
      case "guide":
        return (
          <div className="flex h-full min-h-[400px] flex-col p-6">
            <div className="flex-1 rounded-2xl border border-violet-400/20 bg-violet-400/5 p-5 leading-7 text-slate-200"><span className="font-bold text-violet-300">SVANSAI Guide</span><p className="mt-3">{guideAnswer}</p></div>
            <div className="mt-4 flex gap-2"><input value={guideQuestion} onChange={(event) => setGuideQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && askGuide()} placeholder="Ask about VOS…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-violet-400" /><button onClick={askGuide} className="rounded-xl bg-violet-500 px-5 font-bold">Ask</button></div>
          </div>
        );
      case "browser":
        return (
          <div className="flex h-full min-h-[430px] flex-col bg-[#080b12]">
            <div className="flex gap-2 border-b border-white/10 p-3"><input value={browserAddress} onChange={(event) => setBrowserAddress(event.target.value)} onKeyDown={(event) => event.key === "Enter" && navigateBrowser()} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm outline-none focus:border-sky-400" /><button onClick={navigateBrowser} className="rounded-xl bg-sky-500 px-4 font-bold">Go</button></div>
            <div className="flex-1 overflow-auto p-7">
              {browserPage === "home" && <><p className="text-sm font-bold uppercase tracking-[0.25em] text-sky-300">SV Browser Online</p><h3 className="mt-3 text-3xl font-black">Explore the Vansant ecosystem safely.</h3><div className="mt-6 grid gap-3 sm:grid-cols-2"><button onClick={() => { setBrowserPage("vos"); setBrowserAddress("vansantplatform.com/vos"); }} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10"><strong>VOS</strong><p className="mt-2 text-sm text-slate-400">Desktop, installer, and online preview</p></button><button onClick={() => { setBrowserPage("shield"); setBrowserAddress("vansantplatform.com/shield"); }} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10"><strong>SVANS Shield</strong><p className="mt-2 text-sm text-slate-400">Protection capabilities and scan preview</p></button></div></>}
              {browserPage === "vos" && <><h3 className="text-3xl font-black">Vansant Operating System</h3><p className="mt-3 max-w-xl leading-7 text-slate-300">One desktop for Sandbox, Shield, Debugger, SVANSAI, SV Browser, and Guardian.</p><Link href="/vos" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 font-bold">Visit the VOS page <ExternalLink size={16} /></Link></>}
              {browserPage === "shield" && <><h3 className="text-3xl font-black">SVANS Shield</h3><p className="mt-3 max-w-xl leading-7 text-slate-300">Explore the protection model, then install VOS for local scanning and Guardian evidence.</p><Link href="/shield" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-3 font-bold">Visit Shield <ExternalLink size={16} /></Link></>}
            </div>
          </div>
        );
      case "projects":
        return <div className="p-6"><h3 className="text-xl font-black">Projects</h3><div className="mt-5 grid gap-3 sm:grid-cols-2">{["VOS Online Tour","My First SV App","Shield Review","Sandbox Practice"].map((project) => <div key={project} className="rounded-xl border border-white/10 bg-black/20 p-5"><FolderKanban className="text-cyan-300" /><p className="mt-3 font-bold">{project}</p><p className="mt-1 text-xs text-slate-500">Preview workspace</p></div>)}</div></div>;
      case "settings":
        return <div className="p-6"><h3 className="text-xl font-black">VOS Online Settings</h3><div className="mt-5 space-y-3">{[["Edition","Online Preview"],["Guardian","Demonstration mode"],["Local device access","Disabled"],["Notes storage","This browser only"],["Full edition","Windows installation required"]].map(([label,value]) => <div key={label} className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><span className="text-slate-400">{label}</span><strong>{value}</strong></div>)}</div></div>;
    }
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#040710] text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#080c17] px-5 py-3">
        <div className="flex items-center gap-3"><Sparkles size={16} className="text-cyan-300" /><span className="text-sm font-black tracking-wide">VOS ONLINE PREVIEW</span></div>
        <div className="flex items-center gap-3"><span className="hidden rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-200 sm:inline">Demonstration mode</span><Link href="/vos" className="text-xs font-bold text-cyan-300 hover:text-cyan-200">Get full VOS</Link></div>
      </div>

      <div className="relative min-h-[720px] overflow-hidden bg-gradient-to-br from-[#050711] via-[#0a1021] to-[#17102d]">
        <div className="pointer-events-none absolute -right-24 top-8 h-96 w-96 rounded-full bg-violet-600/50 blur-sm" />
        <div className="pointer-events-none absolute bottom-[-150px] right-24 h-[470px] w-[470px] rounded-full bg-cyan-500/35 blur-sm" />
        <div className="relative p-6 pb-24 sm:p-9 sm:pb-24">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">VANSANT OS</h1>
          <p className="mt-2 text-sm text-slate-300">Explore the web-safe experience before installing.</p>
          <div className="mt-8 grid max-w-[690px] grid-cols-3 gap-3 sm:grid-cols-4">
            {apps.map(({ id, name, icon: Icon, color, localOnly }) => (
              <button key={id} onClick={() => openApp(id)} className="group relative flex min-h-28 flex-col items-center justify-center rounded-xl border border-white/15 bg-[#0c1426]/90 p-3 text-center shadow-lg transition hover:-translate-y-1 hover:border-white/30 hover:bg-[#121d34] focus:outline-none focus:ring-2 focus:ring-cyan-300">
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${color}`}><Icon size={22} /></span>
                <span className="mt-3 text-xs font-bold">{name}</span>
                {localOnly && <span className="mt-1 text-[9px] uppercase tracking-wide text-amber-300">guided preview</span>}
              </button>
            ))}
          </div>
        </div>

        {active && (
          <section className={`absolute z-20 overflow-hidden rounded-2xl border border-white/15 bg-[#0c1220] shadow-[0_28px_100px_rgba(0,0,0,0.65)] ${maximized ? "inset-3 bottom-20" : "inset-x-4 top-20 bottom-24 sm:left-[12%] sm:right-[5%] sm:top-16"}`} aria-label={`${active.name} window`}>
            <header className="flex items-center justify-between border-b border-white/10 bg-[#111827] px-4 py-3">
              <div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-lg ${active.color}`}><active.icon size={17} /></span><div><h2 className="text-sm font-bold">{active.name}</h2>{active.localOnly && <p className="text-[10px] text-amber-300">Guided online preview</p>}</div></div>
              <div className="flex gap-1"><button onClick={() => setActiveApp(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Minimize"><Minus size={16} /></button><button onClick={() => setMaximized((value) => !value)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Toggle maximize"><Maximize2 size={15} /></button><button onClick={() => closeApp(active.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500 hover:text-white" aria-label="Close"><X size={16} /></button></div>
            </header>
            <div className="h-[calc(100%-57px)] overflow-auto">{renderApp(active.id)}</div>
          </section>
        )}

        {startOpen && (
          <div className="absolute bottom-16 left-3 z-30 w-[310px] rounded-2xl border border-white/15 bg-[#090f1e]/95 p-4 shadow-2xl backdrop-blur-xl">
            <p className="px-2 pb-3 text-sm font-black">VOS Start</p>
            <div className="grid grid-cols-2 gap-2">{apps.map(({ id, shortName, icon: Icon }) => <button key={id} onClick={() => openApp(id)} className="flex items-center gap-2 rounded-xl p-3 text-left text-xs font-bold hover:bg-white/10"><Icon size={16} />{shortName}</button>)}</div>
            <Link href="/vos" className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-3 text-sm font-bold">Install full VOS <ChevronRight size={16} /></Link>
          </div>
        )}

        <footer className="absolute inset-x-0 bottom-0 z-40 flex h-16 items-center gap-2 border-t border-white/10 bg-[#05070d]/95 px-3 backdrop-blur-xl">
          <button onClick={() => setStartOpen((value) => !value)} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black">VOS</button>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {openApps.map((id) => {
              const app = appById[id];
              const Icon = app.icon;
              return <button key={id} onClick={() => setActiveApp(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${activeApp === id ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}><Icon size={15} />{app.shortName}</button>;
            })}
          </div>
          <div className="hidden items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400" />Guardian preview</div>
          <span className="shrink-0 text-xs text-slate-400">{clock}</span>
        </footer>
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 bg-[#080c17] p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div><strong>Like the preview?</strong><p className="mt-1 text-xs text-slate-400">Install VOS for real local files, Git, terminals, scanning, debugging, and Guardian protection.</p></div>
        <Link href="/vos" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-3 font-bold">Install and pair VOS <ExternalLink size={16} /></Link>
      </div>
    </main>
  );
}
