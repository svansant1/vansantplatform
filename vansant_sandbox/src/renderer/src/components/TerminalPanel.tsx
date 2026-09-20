import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal, type ILink } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { FileDiagnostics, Problem, RunResult } from "./types";
import ProblemList from "./ProblemList";
import { parseRunProblems } from "./problems";

type Props = {
  result: RunResult | null;
  statusMessage: string;
  loading: boolean;
  workspacePath?: string | null;
  height: number;
  diagnosticsByPath: Record<string, FileDiagnostics>;
  problemsRequest: { id: number; path: string } | null;
  onSelectProblem: (problem: Problem) => void;
  runRequest?: {
    id: number;
    command: string;
  } | null;
};

type TerminalProfile = {
  id: string;
  label: string;
};

type TerminalSession = {
  terminalId: string;
  profileId: string;
  label: string;
  shell: string;
  cwd: string;
};


const TERMINAL_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/;

function getTerminalUrlLinks(
  terminal: Terminal,
  bufferLineNumber: number,
): ILink[] | undefined {
  const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
  if (!line) return undefined;

  const text = line.translateToString(true);
  const links: ILink[] = [];

  for (const match of text.matchAll(TERMINAL_URL_PATTERN)) {
    const rawUrl = match[0];
    const linkText = rawUrl.replace(TRAILING_URL_PUNCTUATION, "");
    const startIndex = match.index ?? 0;

    if (!linkText) continue;

    links.push({
      text: linkText,
      range: {
        start: {
          x: startIndex + 1,
          y: bufferLineNumber,
        },
        end: {
          x: startIndex + linkText.length + 1,
          y: bufferLineNumber,
        },
      },
      decorations: {
        pointerCursor: true,
        underline: true,
      },
      activate: (event, url) => {
        if (!event.ctrlKey && !event.metaKey) return;
        void window.sandboxApi.openExternalUrl(url);
      },
    });
  }

  return links.length > 0 ? links : undefined;
}


export default function TerminalPanel({
  result,
  statusMessage,
  loading,
  workspacePath,
  height,
  runRequest,
  diagnosticsByPath,
  problemsRequest,
  onSelectProblem,
}: Props) {
  const [viewMode, setViewMode] = useState<"terminal" | "output" | "problems">("terminal");
  const [problemPath, setProblemPath] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string>("");
  const [terminalReady, setTerminalReady] = useState(false);

  const [terminalError, setTerminalError] = useState<string>("");
  const [terminalNotice, setTerminalNotice] = useState<string>("");
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeTerminalIdRef = useRef<string | null>(null);
  const autoTerminalKeyRef = useRef<string | null>(null);
  const previousWorkspacePathRef = useRef<string | null | undefined>(
    workspacePath,
  );
  const processedRunRequestRef = useRef<number | null>(null);
  const runProblems = useMemo(() => parseRunProblems(result), [result]);
  const editorProblems = useMemo(() => Object.values(diagnosticsByPath).flatMap((entry) => entry.problems), [diagnosticsByPath]);
  const normalize = (path: string) => path.replace(/\\/g, "/").toLowerCase();
  const matchesPath = (problem: Problem) => !problemPath || Boolean(problem.file && (
    normalize(problem.file) === normalize(problemPath) || normalize(problem.file).startsWith(`${normalize(problemPath)}/`)
  ));
  const visibleEditorProblems = editorProblems.filter(matchesPath);
  const visibleRunProblems = runProblems.filter(matchesPath);
  const problemCount = editorProblems.length + runProblems.length;

  useEffect(() => {
    if (!problemsRequest) return;
    setProblemPath(problemsRequest.path);
    setViewMode("problems");
  }, [problemsRequest]);

  useEffect(() => setProblemPath(null), [workspacePath]);

  const activeSession = useMemo(
    () =>
      sessions.find((session) => session.terminalId === activeTerminalId) ??
      null,
    [sessions, activeTerminalId],
  );

  function fitActiveTerminal() {
    const terminalId = activeTerminalIdRef.current;
    if (!terminalRef.current || !fitAddonRef.current || !terminalId) return;

    fitAddonRef.current.fit();
    void window.sandboxApi.resizeTerminal(
      terminalId,
      terminalRef.current.cols,
      terminalRef.current.rows,
    );
  }

  async function copyTerminalSelection() {
    const terminal = terminalRef.current;
    if (!terminal?.hasSelection()) {
      setTerminalNotice("Select terminal text first, then press Ctrl+C.");
      window.setTimeout(() => setTerminalNotice(""), 1600);
      return false;
    }

    const selectedText = terminal.getSelection();
    if (!selectedText.trim()) return false;

    try {
      await navigator.clipboard.writeText(selectedText);
      setTerminalNotice("Copied terminal selection.");
      window.setTimeout(() => setTerminalNotice(""), 1600);
      return true;
    } catch {
      setTerminalNotice("Could not copy terminal selection.");
      window.setTimeout(() => setTerminalNotice(""), 1600);
      return false;
    }
  }

  async function pasteIntoTerminal() {
    const terminalId = activeTerminalIdRef.current;
    if (!terminalId) return false;

    try {
      const text = await navigator.clipboard.readText();
      if (!text) return false;
      await window.sandboxApi.writeTerminal(terminalId, text);
      terminalRef.current?.focus();
      return true;
    } catch {
      setTerminalNotice("Could not read clipboard.");
      window.setTimeout(() => setTerminalNotice(""), 1600);
      return false;
    }
  }

  useEffect(() => {
    activeTerminalIdRef.current = activeTerminalId;
  }, [activeTerminalId]);

  useEffect(() => {
    let mounted = true;

    const initProfiles = async () => {
      try {
        const terminalProfiles = await window.sandboxApi.listTerminalProfiles();
        if (!mounted) return;

        setProfiles(terminalProfiles);
        if (terminalProfiles.length > 0) {
          setProfileId(terminalProfiles[0].id);
        }
      } catch {
        // ignore for now
      }
    };

    void initProfiles();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (result) {
      setViewMode("output");
    }
  }, [result]);

  useEffect(() => {
    const previousWorkspacePath = previousWorkspacePathRef.current;
    previousWorkspacePathRef.current = workspacePath;

    if (previousWorkspacePath === workspacePath) {
      return;
    }

    setSessions([]);
    setActiveTerminalId(null);
    setTerminalError("");
    autoTerminalKeyRef.current = null;

    if (terminalRef.current) {
      terminalRef.current.clear();
      terminalRef.current.writeln("Workspace changed. Terminal sessions reset.");
      terminalRef.current.writeln("Starting a new terminal for this workspace.");
    }
  }, [workspacePath]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host || terminalRef.current) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'Cascadia Code, Consolas, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: "#0b0d12",
        foreground: "#f4f4f5",
        cursor: "#a855f7",
        black: "#111827",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#60a5fa",
        magenta: "#a855f7",
        cyan: "#22d3ee",
        white: "#e5e7eb",
        brightBlack: "#6b7280",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#93c5fd",
        brightMagenta: "#c084fc",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    fitAddon.fit();
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      const key = event.key.toLowerCase();
      const usesCommandKey = event.ctrlKey || event.metaKey;

      if (usesCommandKey && key === "c" && terminal.hasSelection()) {
        void copyTerminalSelection();
        return false;
      }

      if (usesCommandKey && event.shiftKey && key === "c") {
        void copyTerminalSelection();
        return false;
      }

      if (
        (usesCommandKey && event.shiftKey && key === "v") ||
        (event.shiftKey && event.key === "Insert")
      ) {
        void pasteIntoTerminal();
        return false;
      }

      return true;
    });
    const urlLinkProvider = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        callback(getTerminalUrlLinks(terminal, bufferLineNumber));
      },
    });

    terminal.writeln("Vansant Sandbox Terminal");
    terminal.writeln("Starting terminal...");
    terminal.writeln("");

    terminal.onData((data) => {
      const terminalId = activeTerminalIdRef.current;
      if (!terminalId) return;
      void window.sandboxApi.writeTerminal(terminalId, data);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminalReady(true);

    const onResize = () => fitActiveTerminal();
    const resizeObserver = new ResizeObserver(() => fitActiveTerminal());
    resizeObserver.observe(host);

    window.addEventListener("resize", onResize);

    const removeDataListener = window.sandboxApi.onTerminalData(
      ({ terminalId, data }: { terminalId: string; data: string }) => {
        if (terminalId !== activeTerminalIdRef.current) return;
        terminalRef.current?.write(data);
      },
    );

    const removeExitListener = window.sandboxApi.onTerminalExit(
      ({ terminalId, exitCode }: { terminalId: string; exitCode: number }) => {
        if (terminalId === activeTerminalIdRef.current) {
          terminalRef.current?.writeln("");
          terminalRef.current?.writeln(
            `\x1b[31mTerminal exited with code ${exitCode}\x1b[0m`,
          );
        }

        setSessions((prev) =>
          prev.filter((session) => session.terminalId !== terminalId),
        );

        setActiveTerminalId((prevActive) =>
          prevActive === terminalId ? null : prevActive,
        );
      },
    );

    return () => {
      removeDataListener();
      removeExitListener();
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      urlLinkProvider.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminalReady(false);
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    terminalRef.current.clear();

    if (!activeSession) {
      terminalRef.current.writeln("No active terminal.");
      terminalRef.current.writeln("Create one using the toolbar.");
      return;
    }

    terminalRef.current.writeln(
      `Attached to ${activeSession.label} (${activeSession.cwd})`,
    );

    if (fitAddonRef.current && activeTerminalId) {
      fitActiveTerminal();
    }
  }, [activeSession, activeTerminalId]);

  useEffect(() => {
    fitActiveTerminal();
  }, [height, viewMode, sessions.length]);

  async function createTerminal(requestedProfileId?: string) {
    if (!terminalRef.current || !fitAddonRef.current) return null;

    try {
      setTerminalError("");

      const selectedProfileId =
        requestedProfileId || profileId || profiles[0]?.id || undefined;

      const created = await window.sandboxApi.createTerminal(
        selectedProfileId,
        workspacePath ?? undefined,
        terminalRef.current.cols,
        terminalRef.current.rows,
      );

      setSessions((prev) => [...prev, created]);
      setActiveTerminalId(created.terminalId);
      setViewMode("terminal");

      terminalRef.current.clear();
      terminalRef.current.writeln(
        `Launching ${created.label} in ${created.cwd}`,
      );
      terminalRef.current.focus();
      return created;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create terminal.";
      setTerminalError(message);

      terminalRef.current?.clear();
      terminalRef.current?.writeln("\x1b[31mFailed to create terminal.\x1b[0m");
      terminalRef.current?.writeln(message);
      return null;
    }
  }

  useEffect(() => {
    if (
      !runRequest ||
      !terminalReady ||
      processedRunRequestRef.current === runRequest.id
    ) {
      return;
    }

    processedRunRequestRef.current = runRequest.id;

    const runInteractively = async () => {
      setViewMode("terminal");
      setTerminalError("");

      let terminalId = activeTerminalIdRef.current;

      if (!terminalId) {
        const created = await createTerminal(profileId || profiles[0]?.id);
        terminalId = created?.terminalId ?? null;
      }

      if (!terminalId) {
        setTerminalError("Could not start a terminal for interactive input.");
        return;
      }

      terminalRef.current?.focus();
      await window.sandboxApi.writeTerminal(
        terminalId,
        `${runRequest.command}\r`,
      );
    };

    void runInteractively();
  }, [profileId, profiles, runRequest, terminalReady]);

  useEffect(() => {
    if (!terminalReady || profiles.length === 0 || sessions.length > 0) {
      return;
    }

    const terminalKey = workspacePath ?? "no-workspace";
    if (autoTerminalKeyRef.current === terminalKey) return;

    autoTerminalKeyRef.current = terminalKey;
    void createTerminal(profileId || profiles[0].id);
  }, [terminalReady, profiles, profileId, sessions.length, workspacePath]);

  const killActiveTerminal = async () => {
    if (!activeTerminalId) return;
    await closeTerminal(activeTerminalId);
  };

  const splitTerminal = async () => {
    await createTerminal(profileId);
  };

  const closeTerminal = async (terminalId: string) => {
    try {
      await window.sandboxApi.killTerminal(terminalId);

      setSessions((prev) =>
        prev.filter((session) => session.terminalId !== terminalId),
      );

      setActiveTerminalId((prevActive) => {
        if (prevActive !== terminalId) return prevActive;

        const remaining = sessions.filter(
          (session) => session.terminalId !== terminalId,
        );
        return remaining.length > 0
          ? remaining[remaining.length - 1].terminalId
          : null;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to close terminal.";
      setTerminalError(message);
    }
  };

  return (
    <section className="terminal-panel" style={{ height }}>
      <div className="panel-title-row">
        <h3>{viewMode === "terminal" ? "Terminal" : viewMode === "problems" ? "Problems" : "Output"}</h3>
        <span className="status-pill">
          {viewMode === "terminal"
            ? activeSession
              ? activeSession.label
              : "No Session"
            : viewMode === "problems"
              ? `${visibleEditorProblems.length + visibleRunProblems.length} found`
            : loading
              ? "Running"
              : "Ready"}
        </span>
      </div>

      <div className="terminal-toolbar">
        <div className="terminal-mode-switch">
          <button
            type="button"
            className={`terminal-tab ${viewMode === "terminal" ? "terminal-tab-active" : ""}`}
            onClick={() => setViewMode("terminal")}
          >
            Terminal
          </button>
          <button
            type="button"
            className={`terminal-tab ${viewMode === "output" ? "terminal-tab-active" : ""}`}
            onClick={() => setViewMode("output")}
          >
            Output
          </button>
          <button
            type="button"
            className={`terminal-tab ${viewMode === "problems" ? "terminal-tab-active" : ""}`}
            aria-pressed={viewMode === "problems"}
            onClick={() => { setProblemPath(null); setViewMode("problems"); }}
          >
            Problems ({problemCount})
          </button>
        </div>

        {viewMode === "terminal" ? (
          <div className="terminal-actions">
            <select
              className="terminal-select"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => void createTerminal()}
            >
              New Terminal
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => void splitTerminal()}
            >
              Split Terminal
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => void killActiveTerminal()}
              disabled={!activeTerminalId}
            >
              Kill Terminal
            </button>
          </div>
        ) : null}
      </div>

      {viewMode === "problems" && (
        <div className="terminal-problems-view">
          {problemPath && (
            <div className="problems-filter">
              <span title={problemPath}>{problemPath.split(/[/\\]/).pop()}</span>
              <button type="button" className="problem-link" onClick={() => setProblemPath(null)}>Show all</button>
            </div>
          )}
          <div className="problems-header"><span>Editor issues</span><span>{visibleEditorProblems.length}</span></div>
          <ProblemList problems={visibleEditorProblems} onSelect={onSelectProblem} emptyMessage="No editor issues reported for open files." />
          {result && <>
            <div className="problems-header"><span>Last run{result.filePath ? `: ${result.filePath.split(/[/\\]/).pop()}` : ""}</span><span>{visibleRunProblems.length}</span></div>
            <ProblemList problems={visibleRunProblems} onSelect={onSelectProblem} emptyMessage={runProblems.length ? "No run issues for this selection." : "No issues reported by the last run."} />
          </>}
        </div>
      )}

      <div
        className={`terminal-live-view ${
          viewMode === "terminal" ? "" : "terminal-view-hidden"
        }`}
      >
          <div className="terminal-session-tabs">
            {sessions.length === 0 ? (
              <span className="terminal-empty-label">Starting terminal...</span>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.terminalId}
                  className={`terminal-session-tab ${
                    activeTerminalId === session.terminalId
                      ? "terminal-session-tab-active"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="terminal-session-tab-button"
                    onClick={() => setActiveTerminalId(session.terminalId)}
                  >
                    {session.label}
                  </button>

                  <button
                    type="button"
                    className="terminal-session-tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      void closeTerminal(session.terminalId);
                    }}
                    title={`Close ${session.label}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          {terminalError ? (
            <div className="terminal-status" style={{ color: "#fca5a5" }}>
              {terminalError}
            </div>
          ) : null}

          {terminalNotice ? (
            <div className="terminal-status" style={{ color: "#bae6fd" }}>
              {terminalNotice}
            </div>
          ) : null}

          <div ref={terminalHostRef} className="terminal-xterm-host" />
      </div>

      <div
        className={`terminal-output-view ${
          viewMode === "output" ? "" : "terminal-view-hidden"
        }`}
      >
        {result ? (
          <div className="terminal-output">
            <div className="terminal-command">$ {result.command}</div>
            <div
              className={`problems-panel ${
                result.ok ? "problems-panel-success" : "problems-panel-error"
              }`}
            >
              <div className="problems-header">
                <span>Problems</span>
                <span>
                  {runProblems.length ? `${runProblems.length} found` : "No run errors"}
                </span>
              </div>

              <ProblemList
                problems={runProblems}
                onSelect={onSelectProblem}
                emptyMessage={result.ok ? "The run completed successfully." : "No exact file location was reported. Check the output below."}
              />
            </div>
            {result.stdout ? (
              <pre className="terminal-stdout">{result.stdout}</pre>
            ) : null}
            {result.stderr ? (
              <pre className="terminal-stderr">{result.stderr}</pre>
            ) : null}
          </div>
        ) : (
          <div className="empty-pane">
            {statusMessage || "Run a supported file to see output here."}
          </div>
        )}
      </div>
    </section>
  );
}
