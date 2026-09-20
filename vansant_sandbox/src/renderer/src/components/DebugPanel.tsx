import type { DiagnosticSummary, FileDiagnostics, OpenTab, Problem, RunResult } from "./types";
import ProblemList from "./ProblemList";
import { parseRunProblems } from "./problems";

type DebugPanelProps = {
  activeTab: OpenTab | null;
  runResult: RunResult | null;
  diagnosticsByPath: Record<string, FileDiagnostics>;
  running: boolean;
  onDebugFile: () => void;
  onClose: () => void;
  onSelectProblem: (problem: Problem) => void;
};


function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || filePath;
}


function buildDebugSummary(
  activeTab: OpenTab | null,
  diagnostics: DiagnosticSummary | null,
  runResult: RunResult | null,
): string {
  if (!activeTab) return "Open a code file to start debugging.";
  if (activeTab.kind !== "text") return "Image files cannot be debugged.";
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
  onSelectProblem,
}: DebugPanelProps) {
  const activeDiagnostics = activeTab ? diagnosticsByPath[activeTab.path] ?? null : null;
  const problems = parseRunProblems(runResult);
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
          <span>Editor Issues</span>
          <strong>{activeDiagnostics?.problems.length ?? 0}</strong>
        </div>
        <ProblemList problems={activeDiagnostics?.problems ?? []} onSelect={onSelectProblem} emptyMessage="No editor issues reported for this file." />
      </div>

      <div className="debug-card">
        <div className="debug-section-title">
          <span>Runtime Problems</span>
          <strong>{problems.length}</strong>
        </div>

        <ProblemList
          problems={problems}
          onSelect={onSelectProblem}
          emptyMessage={runResult ? "No runtime problems detected in the latest run." : "No run results yet."}
        />
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
