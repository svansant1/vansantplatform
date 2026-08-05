"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Bookmark,
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
  History,
  Home,
  Maximize2,
  Minus,
  Network,
  NotebookPen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { connectDebugger } from "../../../services/pairingService";

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

type BrowserPage = "home" | "platform" | "vos" | "shield" | "debugger" | "svansai";

type BrowserTab = {
  id: number;
  page: BrowserPage;
  title: string;
  address: string;
  history: BrowserPage[];
  historyIndex: number;
};

const browserRoutes: Record<BrowserPage, { title: string; address: string }> = {
  home: { title: "New Tab", address: "sv://new-tab" },
  platform: { title: "Vansant Platform", address: "vansantplatform.com" },
  vos: { title: "Vansant OS", address: "vansantplatform.com/vos" },
  shield: { title: "SVANS Shield", address: "vansantplatform.com/shield" },
  debugger: { title: "SVANSAI Debugger", address: "vansantplatform.com/debugger" },
  svansai: { title: "SVANSAI", address: "svansai.com" },
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
  const [unlocked, setUnlocked] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState("");
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
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([
    { id: 1, page: "home", ...browserRoutes.home, history: ["home"], historyIndex: 0 },
  ]);
  const [activeBrowserTabId, setActiveBrowserTabId] = useState(1);
  const [nextBrowserTabId, setNextBrowserTabId] = useState(2);
  const [browserAddress, setBrowserAddress] = useState(browserRoutes.home.address);
  const [browserSidebarOpen, setBrowserSidebarOpen] = useState(true);
  const [browserSelection, setBrowserSelection] = useState("");
  const [browserQuestion, setBrowserQuestion] = useState("");
  const [browserAnswer, setBrowserAnswer] = useState(
    "Highlight text in the page, then choose Explain, Summarize, or Ask.",
  );
  const [browserBookmarks, setBrowserBookmarks] = useState<BrowserPage[]>(["platform", "vos"]);
  const [browserVisits, setBrowserVisits] = useState<BrowserPage[]>(["home"]);
  const [browserNotice, setBrowserNotice] = useState("Online protection preview active");

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
  const activeBrowserTab =
    browserTabs.find((tab) => tab.id === activeBrowserTabId) ?? browserTabs[0];
  const clock = useMemo(
    () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()),
    [],
  );

  async function unlockPreview() {
    const normalized = pairCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (normalized.length !== 6) {
      setPairError("Enter the complete six-character code shown on the VOS page.");
      return;
    }
    setPairing(true);
    setPairError("");
    const result = await connectDebugger(normalized, "VOS Online Preview");
    setPairing(false);
    if (!result.ok) {
      setPairError(result.error || "That code is invalid, expired, or already used.");
      return;
    }
    window.sessionStorage.setItem("vos-online-paired", "true");
    setUnlocked(true);
  }

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

  function browserPageFromAddress(address: string): BrowserPage {
    const value = address.trim().toLowerCase();
    if (value.includes("debug")) return "debugger";
    if (value.includes("shield")) return "shield";
    if (value.includes("svansai")) return "svansai";
    if (value.includes("/vos") || value === "vos") return "vos";
    if (value.includes("vansantplatform")) return "platform";
    return "home";
  }

  function visitBrowserPage(page: BrowserPage, preserveForwardHistory = false) {
    const route = browserRoutes[page];
    setBrowserTabs((tabs) =>
      tabs.map((tab) => {
        if (tab.id !== activeBrowserTabId) return tab;
        const nextHistory = preserveForwardHistory
          ? tab.history
          : [...tab.history.slice(0, tab.historyIndex + 1), page];
        return {
          ...tab,
          page,
          title: route.title,
          address: route.address,
          history: nextHistory,
          historyIndex: preserveForwardHistory ? tab.historyIndex : nextHistory.length - 1,
        };
      }),
    );
    setBrowserAddress(route.address);
    setBrowserVisits((visits) => [page, ...visits.filter((item) => item !== page)].slice(0, 6));
    setBrowserNotice(`${route.title} loaded in the online-safe browser`);
  }

  function navigateBrowser() {
    visitBrowserPage(browserPageFromAddress(browserAddress));
  }

  function moveBrowserHistory(offset: -1 | 1) {
    if (!activeBrowserTab) return;
    const nextIndex = activeBrowserTab.historyIndex + offset;
    const page = activeBrowserTab.history[nextIndex];
    if (!page) return;
    const route = browserRoutes[page];
    setBrowserTabs((tabs) =>
      tabs.map((tab) =>
        tab.id === activeBrowserTabId
          ? { ...tab, page, title: route.title, address: route.address, historyIndex: nextIndex }
          : tab,
      ),
    );
    setBrowserAddress(route.address);
    setBrowserNotice(`${route.title} restored from tab history`);
  }

  function addBrowserTab(page: BrowserPage = "home") {
    const route = browserRoutes[page];
    const id = nextBrowserTabId;
    setNextBrowserTabId((value) => value + 1);
    setBrowserTabs((tabs) => [
      ...tabs,
      { id, page, ...route, history: [page], historyIndex: 0 },
    ]);
    setActiveBrowserTabId(id);
    setBrowserAddress(route.address);
    setBrowserNotice("New private preview tab opened");
  }

  function activateBrowserTab(tab: BrowserTab) {
    setActiveBrowserTabId(tab.id);
    setBrowserAddress(tab.address);
    setBrowserNotice(`${tab.title} tab selected`);
  }

  function closeBrowserTab(id: number) {
    if (browserTabs.length === 1) {
      visitBrowserPage("home");
      return;
    }
    const index = browserTabs.findIndex((tab) => tab.id === id);
    const remaining = browserTabs.filter((tab) => tab.id !== id);
    setBrowserTabs(remaining);
    if (id === activeBrowserTabId) {
      const next = remaining[Math.max(0, index - 1)] ?? remaining[0];
      setActiveBrowserTabId(next.id);
      setBrowserAddress(next.address);
    }
  }

  function toggleBrowserBookmark() {
    if (!activeBrowserTab) return;
    setBrowserBookmarks((bookmarks) =>
      bookmarks.includes(activeBrowserTab.page)
        ? bookmarks.filter((page) => page !== activeBrowserTab.page)
        : [...bookmarks, activeBrowserTab.page],
    );
  }

  function captureBrowserSelection() {
    const selection = window.getSelection()?.toString().trim() ?? "";
    if (!selection) {
      setBrowserNotice("Highlight words in the page first, then choose Check highlight");
      return;
    }
    setBrowserSelection(selection.slice(0, 1800));
    setBrowserAnswer("New highlight captured. Choose an SVANSAI action when ready.");
    setBrowserSidebarOpen(true);
    setBrowserNotice("Highlighted text is ready for SVANSAI");
  }

  function respondToBrowserSelection(action: "explain" | "summarize" | "ask") {
    if (!browserSelection) {
      setBrowserAnswer("Highlight text in the page and choose Check highlight first.");
      return;
    }
    if (action === "ask" && !browserQuestion.trim()) {
      setBrowserAnswer("Enter a question about the highlighted text first.");
      return;
    }
    const compact = browserSelection.replace(/\s+/g, " ").trim();
    if (action === "summarize") {
      setBrowserAnswer(
        `Preview summary: ${compact.length > 260 ? `${compact.slice(0, 257)}…` : compact}`,
      );
    } else if (action === "explain") {
      setBrowserAnswer(
        `Preview explanation: This passage describes ${compact.toLowerCase()}. The installed SV Browser can send the complete selection to SVANSAI for a deeper, live response.`,
      );
    } else {
      setBrowserAnswer(
        `Preview answer to “${browserQuestion.trim()}”: The highlighted passage indicates that ${compact.toLowerCase()}`,
      );
    }
  }

  if (!unlocked) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_80%_20%,rgba(124,58,237,0.35),transparent_35%),radial-gradient(circle_at_20%_90%,rgba(6,182,212,0.22),transparent_38%),#050711] p-6 text-white shadow-2xl">
        <section className="w-full max-w-xl rounded-[2rem] border border-white/15 bg-[#0a1020]/95 p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.6)] backdrop-blur sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 shadow-[0_0_35px_rgba(34,211,238,0.25)]">
            <ShieldCheck size={32} />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
            Secure VOS preview
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Pair to unlock VOS Online
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">
            Keep the VOS page open and enter the one-time code shown beneath
            <strong className="text-white"> Explore VOS Online</strong>.
          </p>

          <input
            value={pairCode}
            onChange={(event) =>
              setPairCode(
                event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6),
              )
            }
            onKeyDown={(event) => event.key === "Enter" && unlockPreview()}
            placeholder="------"
            maxLength={6}
            autoFocus
            className="mx-auto mt-7 block w-64 rounded-2xl border-2 border-white/15 bg-black/30 px-5 py-4 text-center font-mono text-3xl font-black tracking-[0.3em] outline-none transition focus:border-cyan-400"
            aria-label="VOS Online pairing code"
          />
          {pairError && (
            <p className="mt-3 text-sm text-rose-300" role="alert">
              {pairError}
            </p>
          )}
          <button
            type="button"
            onClick={unlockPreview}
            disabled={pairing}
            className="mt-5 w-64 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-4 font-bold transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            {pairing ? "Confirming code…" : "Pair and enter preview"}
          </button>
          <div className="mt-6 border-t border-white/10 pt-5">
            <Link
              href="/vos"
              className="text-sm font-bold text-cyan-300 hover:text-cyan-200"
            >
              Return to the VOS page to generate a code
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Codes expire shortly and can only unlock one session.
          </p>
        </section>
      </main>
    );
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
      case "browser": {
        const page = activeBrowserTab?.page ?? "home";
        const isBookmarked = browserBookmarks.includes(page);
        return (
          <div className="flex h-full min-h-[520px] flex-col bg-[#080b12]">
            <div className="flex items-end gap-1 overflow-x-auto border-b border-white/10 bg-[#070a10] px-2 pt-2">
              {browserTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex min-w-[145px] max-w-[210px] items-center gap-2 rounded-t-xl border border-b-0 px-3 py-2 text-xs ${
                    tab.id === activeBrowserTabId
                      ? "border-white/15 bg-[#111827] text-white"
                      : "border-transparent bg-white/[0.03] text-slate-400"
                  }`}
                >
                  <button
                    onClick={() => activateBrowserTab(tab)}
                    className="min-w-0 flex-1 truncate text-left font-bold"
                  >
                    {tab.title}
                  </button>
                  <button
                    onClick={() => closeBrowserTab(tab.id)}
                    className="rounded p-0.5 hover:bg-white/10"
                    aria-label={`Close ${tab.title} tab`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addBrowserTab()}
                className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Open new tab"
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#111827] p-2">
              <div className="flex items-center">
                <button
                  onClick={() => moveBrowserHistory(-1)}
                  disabled={!activeBrowserTab || activeBrowserTab.historyIndex === 0}
                  className="rounded-lg p-2 text-slate-300 hover:bg-white/10 disabled:opacity-30"
                  aria-label="Back"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  onClick={() => moveBrowserHistory(1)}
                  disabled={
                    !activeBrowserTab ||
                    activeBrowserTab.historyIndex >= activeBrowserTab.history.length - 1
                  }
                  className="rounded-lg p-2 text-slate-300 hover:bg-white/10 disabled:opacity-30"
                  aria-label="Forward"
                >
                  <ArrowRight size={16} />
                </button>
                <button
                  onClick={() => setBrowserNotice(`${activeBrowserTab?.title ?? "Page"} refreshed`)}
                  className="rounded-lg p-2 text-slate-300 hover:bg-white/10"
                  aria-label="Refresh"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  onClick={() => visitBrowserPage("home")}
                  className="rounded-lg p-2 text-slate-300 hover:bg-white/10"
                  aria-label="Home"
                >
                  <Home size={16} />
                </button>
              </div>
              <div className="flex min-w-[240px] flex-1 items-center rounded-xl border border-white/10 bg-black/30 px-3">
                <ShieldCheck size={14} className="mr-2 text-emerald-300" />
                <input
                  value={browserAddress}
                  onChange={(event) => setBrowserAddress(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && navigateBrowser()}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
                  aria-label="SV Browser address"
                />
                <button
                  onClick={toggleBrowserBookmark}
                  className={isBookmarked ? "text-amber-300" : "text-slate-500 hover:text-white"}
                  aria-label={isBookmarked ? "Remove bookmark" : "Bookmark page"}
                >
                  <Bookmark size={15} fill={isBookmarked ? "currentColor" : "none"} />
                </button>
              </div>
              <button onClick={navigateBrowser} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold">
                Go
              </button>
              <button
                onMouseDown={(event) => event.preventDefault()}
                onClick={captureBrowserSelection}
                className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200"
              >
                Check highlight
              </button>
              <button
                onClick={() => setBrowserSidebarOpen((value) => !value)}
                className="rounded-xl border border-white/10 p-2 text-violet-200 hover:bg-white/10"
                aria-label="Toggle SVANSAI panel"
              >
                {browserSidebarOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-white/10 bg-[#0b1020] px-3 py-2">
              {browserBookmarks.map((bookmark) => (
                <button
                  key={bookmark}
                  onClick={() => visitBrowserPage(bookmark)}
                  className="shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10"
                >
                  {browserRoutes[bookmark].title}
                </button>
              ))}
              <span className="ml-auto hidden items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 sm:flex">
                <ShieldCheck size={12} /> Safe online routes
              </span>
            </div>

            <div className={`grid min-h-0 flex-1 ${browserSidebarOpen ? "lg:grid-cols-[1fr_315px]" : ""}`}>
              <div className="min-h-0 overflow-auto bg-[radial-gradient(circle_at_85%_15%,rgba(14,165,233,0.12),transparent_30%),#080b12] p-6 selection:bg-violet-500/60">
                {page === "home" && (
                  <>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">
                      SV Browser Online
                    </p>
                    <h3 className="mt-3 max-w-2xl text-3xl font-black">
                      Explore the Vansant ecosystem before installing.
                    </h3>
                    <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                      Open tabs, visit web-safe Vansant destinations, bookmark pages, highlight
                      this text, and try the SVANSAI selection workflow from the side panel.
                    </p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {(["platform", "vos", "shield", "debugger", "svansai"] as BrowserPage[]).map(
                        (destination) => (
                          <button
                            key={destination}
                            onClick={() => visitBrowserPage(destination)}
                            className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:-translate-y-0.5 hover:border-sky-400/30 hover:bg-white/10"
                          >
                            <strong>{browserRoutes[destination].title}</strong>
                            <p className="mt-2 text-sm text-slate-400">
                              {destination === "platform" && "Projects, downloads, and the Vansant ecosystem"}
                              {destination === "vos" && "Desktop, Guardian, and integrated SV tools"}
                              {destination === "shield" && "Protection layers and scan demonstrations"}
                              {destination === "debugger" && "Diagnostics, findings, and guided fixes"}
                              {destination === "svansai" && "Selection-aware assistance inside the browser"}
                            </p>
                          </button>
                        ),
                      )}
                    </div>
                    <div className="mt-6 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-5">
                      <p className="font-bold text-emerald-200">Try the highlight workflow</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        SVANSAI can explain selected material without losing the page you are
                        reading. Drag across this sentence, choose Check highlight, and test an
                        action in the panel.
                      </p>
                    </div>
                  </>
                )}

                {page === "platform" && (
                  <>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
                      Vansant Platform
                    </p>
                    <h3 className="mt-3 text-3xl font-black">One home for every SV project.</h3>
                    <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                      Vansant Platform connects VOS, SV Browser, SVANSAI, Shield, Debugger, and
                      your project workspace through one consistent experience.
                    </p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      {["Explore products", "Pair your desktop", "Continue projects"].map((item) => (
                        <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                          <CheckCircle2 className="text-orange-300" size={20} />
                          <p className="mt-3 font-bold">{item}</p>
                        </div>
                      ))}
                    </div>
                    <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-bold">
                      Open full Platform <ExternalLink size={16} />
                    </Link>
                  </>
                )}

                {page === "vos" && (
                  <>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-300">Vansant Operating System</p>
                    <h3 className="mt-3 text-3xl font-black">The armor and guide layer for your SV workspace.</h3>
                    <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                      VOS brings Sandbox, Shield, Debugger, SV Browser, SVANSAI, and Guardian
                      into one desktop where applications stay contained inside the operating
                      environment.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link href="/vos" className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 font-bold">
                        Explore VOS <ExternalLink size={16} />
                      </Link>
                      <a href="/downloads/VOS-Founding-Beta-0.16.0-Windows-Setup-R8.exe" download className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-bold hover:bg-white/10">
                        Download VOS <ExternalLink size={16} />
                      </a>
                    </div>
                  </>
                )}

                {page === "shield" && (
                  <>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">SVANS Shield</p>
                    <h3 className="mt-3 text-3xl font-black">Protection that explains what it sees.</h3>
                    <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                      The online Shield experience demonstrates risk layers, findings, and
                      Guardian evidence. The installed edition is required for real local file,
                      process, and network inspection.
                    </p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {["Application armor", "Download inspection", "Incident evidence", "Guardian coordination"].map((item) => (
                        <div key={item} className="flex items-center gap-3 rounded-xl border border-rose-400/15 bg-rose-400/5 p-4">
                          <ShieldCheck size={18} className="text-rose-300" /><span>{item}</span>
                        </div>
                      ))}
                    </div>
                    <Link href="/shield" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-3 font-bold">
                      Open Shield demonstration <ExternalLink size={16} />
                    </Link>
                  </>
                )}

                {page === "debugger" && (
                  <>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-purple-300">SVANSAI Debugger</p>
                    <h3 className="mt-3 text-3xl font-black">Turn technical failures into guided fixes.</h3>
                    <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                      The Debugger organizes logs, diagnostics, likely causes, and recovery
                      actions. Pairing connects the website experience to an authorized desktop
                      session without giving the webpage unrestricted device access.
                    </p>
                    <Link href="/debugger" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-500 px-5 py-3 font-bold">
                      Try Debugger pairing <ExternalLink size={16} />
                    </Link>
                  </>
                )}

                {page === "svansai" && (
                  <>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">SVANSAI</p>
                    <h3 className="mt-3 text-3xl font-black">Ask questions without leaving what you are reading.</h3>
                    <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                      Highlight a passage on any online-safe page and open it in the SVANSAI
                      panel. The online version demonstrates the selection workflow; the desktop
                      browser adds live responses, broader browsing, and local Vansant tools.
                    </p>
                    <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5 text-sm leading-6 text-slate-200">
                      Sample selection: Guardian Core coordinates trusted modules and records
                      evidence so security findings can become understandable, reviewable
                      incidents instead of unexplained warnings.
                    </div>
                  </>
                )}
              </div>

              {browserSidebarOpen && (
                <aside className="min-h-0 overflow-auto border-l border-white/10 bg-[#080d18] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-violet-300">SVANSAI selection</p>
                      <p className="mt-1 text-[11px] text-slate-500">Online demonstration</p>
                    </div>
                    <Bot size={20} className="text-violet-300" />
                  </div>
                  <p className="mt-4 text-xs font-bold text-slate-300">Highlighted text</p>
                  <div className="mt-2 min-h-28 rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
                    {browserSelection || "Highlight text on the page, then choose Check highlight."}
                  </div>
                  <input
                    value={browserQuestion}
                    onChange={(event) => setBrowserQuestion(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && respondToBrowserSelection("ask")}
                    placeholder="Optional question…"
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-violet-400"
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button onClick={() => respondToBrowserSelection("explain")} className="rounded-lg bg-blue-500 px-2 py-2 text-[11px] font-bold">Explain</button>
                    <button onClick={() => respondToBrowserSelection("summarize")} className="rounded-lg bg-amber-600 px-2 py-2 text-[11px] font-bold">Summarize</button>
                    <button onClick={() => respondToBrowserSelection("ask")} className="rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-bold">Ask</button>
                  </div>
                  <p className="mt-4 text-xs font-bold text-slate-300">SVANSAI response</p>
                  <div className="mt-2 min-h-36 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-xs leading-5 text-slate-200">
                    {browserAnswer}
                  </div>
                  <a href="/downloads/SV-Browser.exe" download className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 px-4 py-3 text-xs font-bold">
                    Continue in SV Browser <ExternalLink size={14} />
                  </a>
                </aside>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#070a10] px-3 py-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1 text-emerald-300"><ShieldCheck size={11} /> {browserNotice}</span>
              <button onClick={() => setBrowserNotice(`Recent: ${browserVisits.map((item) => browserRoutes[item].title).join(" · ")}`)} className="ml-auto flex items-center gap-1 hover:text-white">
                <History size={11} /> History
              </button>
              <span>Desktop-only protection remains disabled online</span>
            </div>
          </div>
        );
      }
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

      <div className="relative min-h-[760px] overflow-hidden bg-gradient-to-br from-[#050814] via-[#091225] to-[#12102a]">
        <div
          className="pointer-events-none absolute bottom-20 right-4 w-[clamp(130px,22vw,330px)] sm:right-6"
          data-vos-position="bottom-right"
        >
          <Image
            src="/branding/vos-desktop-emblem.png"
            alt=""
            width={500}
            height={500}
            className="h-auto w-full opacity-80"
            aria-hidden="true"
          />
        </div>

        <div className="relative p-4 pb-24 sm:p-6 sm:pb-24">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#091225]/95 px-4 py-3 shadow-xl">
            <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-cyan-300 bg-violet-600 font-black">SV</div>
            <div>
              <p className="text-sm font-black tracking-wide">VANSANT OS</p>
              <p className="text-[11px] text-slate-400">Personal workspace</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setStartOpen(true)} className="hidden items-center gap-2 rounded-xl bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/20 sm:flex"><Search size={14} /> Search apps</button>
              <button onClick={() => openApp("guardian")} className="rounded-xl bg-white/5 px-4 py-2 text-xs font-bold hover:bg-white/10">Notifications</button>
              <button onClick={() => openApp("settings")} className="rounded-xl bg-white/5 p-2.5 text-slate-300 hover:bg-white/10" aria-label="Open settings"><Settings size={16} /></button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_0.85fr]">
            <section className="rounded-2xl border border-white/10 bg-[#0c172b]/95 p-5 shadow-xl sm:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">Your VOS workspace</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Good to see you, Shawn.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Continue a project, ask SVANSAI, or review protection without leaving the desktop.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <button onClick={() => openApp("projects")} className="rounded-xl bg-cyan-700/80 p-4 text-left transition hover:-translate-y-0.5 hover:bg-cyan-600"><FolderKanban size={20} /><strong className="mt-3 block text-sm">Open Projects</strong><span className="mt-1 block text-[11px] text-cyan-100/80">Continue recent work</span></button>
                <button onClick={() => openApp("guide")} className="rounded-xl bg-violet-700/80 p-4 text-left transition hover:-translate-y-0.5 hover:bg-violet-600"><Bot size={20} /><strong className="mt-3 block text-sm">Ask SVANSAI</strong><span className="mt-1 block text-[11px] text-violet-100/80">Get guidance in context</span></button>
                <button onClick={() => openApp("sandbox")} className="rounded-xl bg-emerald-700/80 p-4 text-left transition hover:-translate-y-0.5 hover:bg-emerald-600"><Code2 size={20} /><strong className="mt-3 block text-sm">Launch Sandbox</strong><span className="mt-1 block text-[11px] text-emerald-100/80">Build and test safely</span></button>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-400/20 bg-[#0a1627]/95 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">Security Center</p>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-black text-emerald-300">PREVIEW PROTECTED</span>
              </div>
              <h2 className="mt-3 text-lg font-black">Guardian is watching the workspace.</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">Demonstration modules are connected. Local protection activates after installation.</p>
              <div className="mt-4 space-y-2">
                {[["Shield","Ready","text-emerald-300"],["Network Armor","Normal","text-cyan-300"],["Open incidents","Review","text-amber-300"]].map(([label,value,color]) => <div key={label} className="flex items-center rounded-xl bg-white/5 px-3 py-2 text-xs"><span className={`mr-2 ${color}`}>●</span><span>{label}</span><strong className={`ml-auto ${color}`}>{value}</strong></div>)}
              </div>
              <button onClick={() => openApp("guardian")} className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-[#06110d] hover:bg-emerald-400">Open Security Center</button>
            </section>
          </div>

          <div className="mt-5 flex items-end justify-between">
            <div><h2 className="text-sm font-black">Pinned apps</h2><p className="mt-1 text-[11px] text-slate-500">Your everyday Vansant tools</p></div>
            <button onClick={() => setStartOpen(true)} className="text-xs font-bold text-cyan-300 hover:text-cyan-200">View all apps</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {apps.filter((app) => ["files","projects","browser","guide","sandbox"].includes(app.id)).map(({ id, name, icon: Icon, color }) => (
              <button key={id} onClick={() => openApp(id)} className="group flex min-h-20 items-center rounded-xl border border-white/10 bg-[#111c31]/90 p-3 text-left shadow-lg transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-[#172642]">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${color}`}><Icon size={20} /></span>
                <span className="ml-3"><strong className="block text-xs">{name === "SVANSAI Guide" ? "SVANSAI" : name}</strong><span className="mt-1 block text-[10px] text-slate-500">{id === "files" ? "Your files" : id === "projects" ? "Recent work" : id === "browser" ? "Secure browsing" : id === "guide" ? "AI guidance" : "Build safely"}</span></span>
              </button>
            ))}
          </div>
        </div>

        {active && (
          <section className={`absolute z-20 overflow-hidden rounded-2xl border border-white/15 bg-[#0c1220] shadow-[0_28px_100px_rgba(0,0,0,0.65)] ${maximized ? "inset-3 bottom-20" : "inset-x-4 top-20 bottom-24 sm:left-[12%] sm:right-[5%] sm:top-16"}`} aria-label={`${active.name} window`}>
            <header className="flex items-center justify-between border-b border-white/10 border-l-4 border-l-cyan-400 bg-[#0d1a30] px-4 py-3">
              <div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-lg ${active.color}`}><active.icon size={17} /></span><div><div className="flex items-center gap-2"><h2 className="text-sm font-bold">{active.name}</h2><span className="text-[8px] font-black tracking-wider text-slate-500">VOS APP</span></div>{active.localOnly && <p className="text-[10px] text-amber-300">Guided online preview</p>}</div></div>
              <div className="flex gap-1"><button onClick={() => setActiveApp(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Minimize"><Minus size={16} /></button><button onClick={() => setMaximized((value) => !value)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Toggle maximize"><Maximize2 size={15} /></button><button onClick={() => closeApp(active.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500 hover:text-white" aria-label="Close"><X size={16} /></button></div>
            </header>
            <div className="h-[calc(100%-57px)] overflow-auto">{renderApp(active.id)}</div>
          </section>
        )}

        {startOpen && (
          <div className="absolute bottom-16 left-3 z-30 w-[min(590px,calc(100%-24px))] rounded-2xl border border-white/15 bg-[#091326]/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4"><div className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300 bg-violet-600 font-black">S</div><div><p className="text-sm font-black">Shawn&apos;s workspace</p><p className="text-[10px] text-slate-500">Vansant OS</p></div><button onClick={() => openApp("settings")} className="ml-auto rounded-xl bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10">Settings</button></div>
            <button className="mt-4 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-xs text-slate-500"><Search size={14} /> Search apps, settings, and tools</button>
            <p className="px-1 pb-2 pt-4 text-xs font-black">Pinned</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{apps.map(({ id, shortName, icon: Icon, color }) => <button key={id} onClick={() => openApp(id)} className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl bg-white/5 p-2 text-center text-[10px] font-bold hover:bg-white/10"><span className={`grid h-7 w-7 place-items-center rounded-lg ${color}`}><Icon size={14} /></span>{shortName}</button>)}</div>
            <Link href="/vos" className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-3 text-sm font-bold">Install full VOS <ChevronRight size={16} /></Link>
          </div>
        )}

        <footer className="absolute inset-x-0 bottom-0 z-40 flex h-16 items-center gap-2 border-t border-white/10 bg-[#05070d]/95 px-3 backdrop-blur-xl">
          <button onClick={() => setStartOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-xl bg-violet-600 text-sm font-black">SV</button>
          <span className="hidden text-xs font-black sm:inline">VOS</span>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {openApps.map((id) => {
              const app = appById[id];
              const Icon = app.icon;
              return <button key={id} onClick={() => setActiveApp(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${activeApp === id ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}><Icon size={15} />{app.shortName}</button>;
            })}
          </div>
          <div className="hidden items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400" />Guardian online preview</div>
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
