import type { DiagnosticSummary, OpenTab, RunResult } from "./types";

type DebugPanelProps = {
  activeTab: OpenTab | null;
  runResult: RunResult | null;
  diagnosticsByPath: Record<string, DiagnosticSummary>;
  running: boolean;
  onDebugFile: () => void;
  onClose: () => void;
};

type DebugProblem = {
  line?: number;
  column?: number;
  message: string;
};

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || filePath;
}

function parseDebugProblems(result: RunResult | null): DebugProblem[] {
  if (!result) return [];

  const output = `${result.stderr}\n${result.stdout}`;
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const problems: DebugProblem[] = [];

  for (const line of lines) {
    const pythonMatch = line.match(/File ".*?", line (\d+)/);
    const jsMatch = line.match(/:(\d+):(\d+)\)?$/);

    if (/error|exception|traceback|syntax/i.test(line) || pythonMatch || jsMatch) {
      problems.push({
        line: pythonMatch ? Number(pythonMatch[1]) : jsMatch ? Number(jsMatch[1]) : undefined,
        column: jsMatch ? Number(jsMatch[2]) : undefined,
        message: line,
      });
    }
  }

  if (problems.length === 0 && result.exitCode !== 0) {
    problems.push({
      message: result.stderr.trim() || result.stdout.trim() || "Process exited with an error.",
    });
  }

  return problems.slice(0, 8);
}

function buildDebugSummary(
  activeTab: OpenTab | null,
  diagnostics: DiagnosticSummary | null,
  runResult: RunResult | null,
): string {
  if (!activeTab) return "Open a code file to start debugging.";
  if (activeTab.kind !== "text") return "Image files cannot be debugged.";
  if (activeTab.isDirty) return "Save the file before debugging for the cleanest result.";
  if (diagnostics && diagnostics.errors > 0) return "Fix editor errors before running.";
  if (runResult && !runResult.ok) return "The latest run found runtime errors.";
  if (runResult?.ok) return "The latest run completed without runtime errors.";

  return "Ready to debug this file.";
}

export default function DebugPanel({
  activeTab,
  runResult,
  diagnosticsByPath,
  running,
  onDebugFile,
  onClose,
}: DebugPanelProps) {
  const activeDiagnostics = activeTab ? diagnosticsByPath[activeTab.path] ?? null : null;
  const problems = parseDebugProblems(runResult);
  const activeTextTab = activeTab?.kind === "text" ? activeTab : null;
  const canDebug = Boolean(activeTextTab && !running);

  return (
    <aside className="debug-panel">
      <div className="debug-header">
        <div>
          <div className="debug-eyebrow">Debug</div>
          <h3>Debug Center</h3>
        </div>

        <button type="button" className="debug-close-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="debug-card debug-current-file">
        <span>Current File</span>
        <strong>{activeTab ? basename(activeTab.path) : "No file selected"}</strong>
        <p>{buildDebugSummary(activeTab, activeDiagnostics, runResult)}</p>
      </div>

      <button
        type="button"
        className="primary-btn debug-run-btn"
        onClick={onDebugFile}
        disabled={!canDebug}
      >
        {running ? "Debugging..." : "Debug File"}
      </button>

      <div className="debug-grid">
        <div className="debug-stat">
          <span>Editor Errors</span>
          <strong>{activeDiagnostics?.errors ?? 0}</strong>
        </div>
        <div className="debug-stat">
          <span>Warnings</span>
          <strong>{activeDiagnostics?.warnings ?? 0}</strong>
        </div>
        <div className="debug-stat">
          <span>Exit Code</span>
          <strong>{runResult?.exitCode ?? "-"}</strong>
        </div>
        <div className="debug-stat">
          <span>Status</span>
          <strong>{runResult ? (runResult.ok ? "Pass" : "Fail") : "Idle"}</strong>
        </div>
      </div>

      <div className="debug-card">
        <div className="debug-section-title">
          <span>Runtime Problems</span>
          <strong>{problems.length}</strong>
        </div>

        {problems.length ? (
          <div className="debug-problem-list">
            {problems.map((problem, index) => (
              <div key={`${problem.message}_${index}`} className="debug-problem">
                <span>
                  {problem.line
                    ? `Line ${problem.line}${problem.column ? `:${problem.column}` : ""}`
                    : "Runtime"}
                </span>
                <p>{problem.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="debug-muted">
            {runResult ? "No runtime problems detected in the latest run." : "Run Debug File to capture runtime output."}
          </p>
        )}
      </div>

      <div className="debug-card">
        <div className="debug-section-title">
          <span>Last Command</span>
        </div>
        <code className="debug-command">{runResult?.command ?? "No command has run yet."}</code>
      </div>

      <div className="debug-card debug-output-card">
        <div className="debug-section-title">
          <span>Output</span>
        </div>
        <pre>{runResult ? runResult.stderr || runResult.stdout || "No output." : "No debug output yet."}</pre>
      </div>
    </aside>
  );
}
