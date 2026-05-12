import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { RunResult } from "./types";

type Props = {
  result: RunResult | null;
  statusMessage: string;
  loading: boolean;
  workspacePath?: string | null;
  height: number;
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

type RunProblem = {
  file?: string;
  line?: number;
  column?: number;
  severity: "error" | "warning" | "info";
  message: string;
};

function addProblem(problems: RunProblem[], nextProblem: RunProblem): void {
  const key = `${nextProblem.file ?? ""}:${nextProblem.line ?? ""}:${
    nextProblem.column ?? ""
  }:${nextProblem.message}`;

  const exists = problems.some((problem) => {
    const problemKey = `${problem.file ?? ""}:${problem.line ?? ""}:${
      problem.column ?? ""
    }:${problem.message}`;

    return problemKey === key;
  });

  if (!exists) {
    problems.push(nextProblem);
  }
}

function parseRunProblems(result: RunResult | null): RunProblem[] {
  if (!result) return [];

  const problems: RunProblem[] = [];
  const output = `${result.stderr}\n${result.stdout}`;
  const lines = output.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const tsMatch = line.match(
      /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/i,
    );

    if (tsMatch) {
      addProblem(problems, {
        file: tsMatch[1],
        line: Number(tsMatch[2]),
        column: Number(tsMatch[3]),
        severity: tsMatch[4].toLowerCase() === "warning" ? "warning" : "error",
        message: `${tsMatch[5]}: ${tsMatch[6]}`,
      });
      continue;
    }

    const javaMatch = line.match(
      /^(.+?\.java):(\d+):\s+(error|warning):\s+(.+)$/i,
    );

    if (javaMatch) {
      addProblem(problems, {
        file: javaMatch[1],
        line: Number(javaMatch[2]),
        severity:
          javaMatch[3].toLowerCase() === "warning" ? "warning" : "error",
        message: javaMatch[4],
      });
      continue;
    }

    const genericMatch = line.match(/^(.+?):(\d+):(\d+):\s+(.+)$/);

    if (genericMatch) {
      addProblem(problems, {
        file: genericMatch[1],
        line: Number(genericMatch[2]),
        column: Number(genericMatch[3]),
        severity: /warning/i.test(genericMatch[4]) ? "warning" : "error",
        message: genericMatch[4],
      });
      continue;
    }

    const pythonMatch = line.match(/^File "(.+?)", line (\d+)(?:, in .*)?$/);

    if (pythonMatch) {
      const nextLine = lines
        .slice(index + 1)
        .map((candidate) => candidate.trim())
        .find(Boolean);

      addProblem(problems, {
        file: pythonMatch[1],
        line: Number(pythonMatch[2]),
        severity: "error",
        message: nextLine || "Python traceback",
      });
    }
  }

  if (problems.length === 0 && result.exitCode !== 0) {
    const fallbackMessage =
      lines.map((line) => line.trim()).find(Boolean) ||
      "The run finished with an error, but no file location was reported.";

    addProblem(problems, {
      severity: "error",
      message: fallbackMessage,
    });
  }

  return problems.slice(0, 8);
}

export default function TerminalPanel({
  result,
  statusMessage,
  loading,
  workspacePath,
  height,
}: Props) {
  const [viewMode, setViewMode] = useState<"terminal" | "output">("terminal");
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string>("");
  const [terminalReady, setTerminalReady] = useState(false);

  const [terminalError, setTerminalError] = useState<string>("");
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeTerminalIdRef = useRef<string | null>(null);
  const autoTerminalKeyRef = useRef<string | null>(null);
  const previousWorkspacePathRef = useRef<string | null | undefined>(
    workspacePath,
  );
  const runProblems = useMemo(() => parseRunProblems(result), [result]);

  const activeSession = useMemo(
    () =>
      sessions.find((session) => session.terminalId === activeTerminalId) ??
      null,
    [sessions, activeTerminalId],
  );

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

    if (!previousWorkspacePath || previousWorkspacePath === workspacePath) {
      return;
    }

    setSessions([]);
    setActiveTerminalId(null);
    setTerminalError("");
    autoTerminalKeyRef.current = null;

    if (terminalRef.current) {
      terminalRef.current.clear();
      terminalRef.current.writeln(
        "Workspace changed. Terminal sessions reset.",
      );
      terminalRef.current.writeln(
        "Starting a new terminal for this workspace.",
      );
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

    const onResize = () => {
      const terminalId = activeTerminalIdRef.current;
      if (!terminalRef.current || !fitAddonRef.current || !terminalId) return;

      fitAddonRef.current.fit();
      void window.sandboxApi.resizeTerminal(
        terminalId,
        terminalRef.current.cols,
        terminalRef.current.rows,
      );
    };

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
      window.removeEventListener("resize", onResize);
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
      fitAddonRef.current.fit();
      void window.sandboxApi.resizeTerminal(
        activeTerminalId,
        terminalRef.current.cols,
        terminalRef.current.rows,
      );
    }
  }, [activeSession, activeTerminalId]);

  async function createTerminal(requestedProfileId?: string) {
    if (!terminalRef.current || !fitAddonRef.current) return;

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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create terminal.";
      setTerminalError(message);

      terminalRef.current?.clear();
      terminalRef.current?.writeln("\x1b[31mFailed to create terminal.\x1b[0m");
      terminalRef.current?.writeln(message);
    }
  }

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
        <h3>{viewMode === "terminal" ? "Terminal" : "Output"}</h3>
        <span className="status-pill">
          {viewMode === "terminal"
            ? activeSession
              ? activeSession.label
              : "No Session"
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
                  {result.ok ? "No run errors" : `${runProblems.length} found`}
                </span>
              </div>

              {runProblems.length > 0 ? (
                <div className="problems-list">
                  {runProblems.map((problem, index) => (
                    <div
                      key={`${problem.file ?? "run"}-${problem.line ?? index}-${problem.message}`}
                      className="problem-item"
                    >
                      <span
                        className={`problem-severity problem-${problem.severity}`}
                      >
                        {problem.severity}
                      </span>
                      <span className="problem-location">
                        {problem.file
                          ? `${problem.file}${
                              problem.line
                                ? `:${problem.line}${problem.column ? `:${problem.column}` : ""}`
                                : ""
                            }`
                          : "Run output"}
                      </span>
                      <span className="problem-message">{problem.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="problems-empty">
                  {result.ok
                    ? "The run completed successfully."
                    : "No exact file location was reported. Check the output below."}
                </div>
              )}
            </div>
            {result.stdout ? (
              <pre className="terminal-stdout">{result.stdout}</pre>
            ) : null}
            {result.stderr ? (
              <pre className="terminal-stderr">{result.stderr}</pre>
            ) : null}
            <div className="terminal-exit">
              Exit code: {String(result.exitCode)}
            </div>
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
