"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listDebugProcesses } from "../../services/processService";
import { readDebugFile } from "../../services/fileService";
import {
  analyzeDebugOutput,
  analyzeSelectedIssue,
  draftFixForIssue,
  parseDebugIssues,
} from "../../services/debuggerService";
import { useConsoleExecution } from "../../hooks/useConsoleExecution";
import type { RunningProcess } from "../../types/process";
import type { ParsedIssue } from "../../types/debugger";

type DirectoryEntry = {
  name?: string;
  path?: string;
  is_file?: boolean;
  is_dir?: boolean;
};

function buildIssueId(issue: Omit<ParsedIssue, "id">): string {
  return [
    issue.file,
    issue.line,
    issue.column,
    issue.severity,
    issue.rule,
    issue.message,
  ].join("::");
}

function dedupeIssues(issues: ParsedIssue[]): ParsedIssue[] {
  const seen = new Set<string>();
  const unique: ParsedIssue[] = [];

  for (const issue of issues) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    unique.push(issue);
  }

  return unique;
}

function parseIssuesFromTerminalOutput(terminalOutput: string): ParsedIssue[] {
  if (!terminalOutput.trim()) return [];

  const issues: ParsedIssue[] = [];
  const lines = terminalOutput.split(/\r?\n/);

  const nextStylePattern =
    /(\.\.?\/[^:\n]+|[A-Za-z]:\\[^:\n]+|[\w./\\-]+\.(?:ts|tsx|js|jsx|py|json|yaml|yml|css|html)):(\d+):(\d+)\s*-?\s*(warning|error|info)?\s*(.*?)(?:\s+([@\w./-]+))?$/i;
  const simplePattern =
    /(\.\.?\/[^:\n]+|[A-Za-z]:\\[^:\n]+|[\w./\\-]+\.(?:ts|tsx|js|jsx|py|json|yaml|yml|css|html)):(\d+):(\d+)\s+(.*)$/i;
  const pythonTracePattern = /File\s+"([^"]+)",\s+line\s+(\d+)/i;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const nextMatch = line.match(nextStylePattern);
    if (nextMatch) {
      const [, file, lineNum, columnNum, severityRaw, restMessage, ruleRaw] =
        nextMatch;
      const severity = (severityRaw?.toLowerCase() ||
        "error") as ParsedIssue["severity"];
      const message = (restMessage || "Issue detected").trim();
      const rule = (ruleRaw || "terminal").trim();
      const issueBase: Omit<ParsedIssue, "id"> = {
        file,
        line: Number(lineNum),
        column: Number(columnNum),
        severity,
        message,
        rule,
        source: "terminal",
      };
      issues.push({ id: buildIssueId(issueBase), ...issueBase });
      return;
    }

    const simpleMatch = line.match(simplePattern);
    if (simpleMatch) {
      const [, file, lineNum, columnNum, messageRaw] = simpleMatch;
      const lowered = messageRaw.toLowerCase();
      const severity: ParsedIssue["severity"] = lowered.includes("warning")
        ? "warning"
        : lowered.includes("info")
          ? "info"
          : "error";
      const issueBase: Omit<ParsedIssue, "id"> = {
        file,
        line: Number(lineNum),
        column: Number(columnNum),
        severity,
        message: messageRaw.trim(),
        rule: "terminal",
        source: "terminal",
      };
      issues.push({ id: buildIssueId(issueBase), ...issueBase });
      return;
    }

    const pythonMatch = line.match(pythonTracePattern);
    if (pythonMatch) {
      const [, file, lineNum] = pythonMatch;
      const nextLine = lines[index + 1]?.trim() || "Python traceback";
      const issueBase: Omit<ParsedIssue, "id"> = {
        file,
        line: Number(lineNum),
        column: 1,
        severity: "error",
        message: nextLine,
        rule: "traceback",
        source: "terminal",
      };
      issues.push({ id: buildIssueId(issueBase), ...issueBase });
      return;
    }
  });

  return dedupeIssues(issues);
}

function analyzeIssueLocally(
  issue: ParsedIssue,
  sourceCode: string,
  filePath: string,
): string {
  const loweredMessage = issue.message.toLowerCase();
  const insights: string[] = [];

  insights.push(`Severity: ${issue.severity.toUpperCase()}`);
  insights.push(`Location: ${issue.file}:${issue.line}:${issue.column}`);
  insights.push(`Rule: ${issue.rule || "unknown"}`);

  if (filePath && issue.file && filePath !== issue.file) {
    insights.push(
      "Note: The currently loaded file path does not match the issue file path.",
    );
  }

  if (loweredMessage.includes("module") || loweredMessage.includes("import")) {
    insights.push("This looks like a dependency or import resolution problem.");
    insights.push(
      "Check module path spelling, package installation, or package root resolution.",
    );
  } else if (
    loweredMessage.includes("type") ||
    loweredMessage.includes("property")
  ) {
    insights.push(
      "This looks like a type-shape mismatch or invalid property access.",
    );
    insights.push(
      "Compare the object contract against the accessed field and tighten guards or types.",
    );
  } else if (
    loweredMessage.includes("permission") ||
    loweredMessage.includes("access denied")
  ) {
    insights.push("This looks like a permission or policy restriction.");
    insights.push(
      "Confirm the action is allowed by the debugger workflow before retrying.",
    );
  } else if (
    loweredMessage.includes("syntax") ||
    loweredMessage.includes("unexpected")
  ) {
    insights.push("This looks like a syntax or structural parse error.");
    insights.push(
      "Inspect the target line and surrounding block for punctuation, bracket, or quote mismatches.",
    );
  } else if (
    loweredMessage.includes("timeout") ||
    loweredMessage.includes("network") ||
    loweredMessage.includes("connect")
  ) {
    insights.push("This looks like a connectivity or timeout issue.");
    insights.push(
      "Check service availability, ports, and network reachability.",
    );
  } else {
    insights.push(
      "General issue detected. Review the message, surrounding code, and command output together.",
    );
  }

  if (sourceCode.trim()) {
    const sourceLines = sourceCode.split("\n");
    const targetLine = sourceLines[issue.line - 1] ?? "";
    const previousLine = sourceLines[issue.line - 2] ?? "";
    const nextLine = sourceLines[issue.line] ?? "";

    insights.push("Context Preview:");
    if (previousLine) insights.push(`  ${issue.line - 1}: ${previousLine}`);
    insights.push(`  ${issue.line}: ${targetLine}`);
    if (nextLine) insights.push(`  ${issue.line + 1}: ${nextLine}`);
  } else {
    insights.push("No source code is currently loaded for deeper analysis.");
  }

  return insights.join("\n");
}

function buildDraftFixLocally(issue: ParsedIssue, sourceCode: string): string {
  const loweredMessage = issue.message.toLowerCase();
  const draft: string[] = [];

  draft.push(`Target: ${issue.file}:${issue.line}:${issue.column}`);
  draft.push(`Severity: ${issue.severity.toUpperCase()}`);
  draft.push(`Problem: ${issue.message}`);
  draft.push("");
  draft.push("Suggested Fix Strategy:");

  if (loweredMessage.includes("module") || loweredMessage.includes("import")) {
    draft.push(
      "1. Verify the import path or module name is spelled correctly.",
    );
    draft.push(
      "2. Confirm the package is installed in the active environment.",
    );
    draft.push(
      "3. Confirm the project root/package resolution is configured correctly.",
    );
  } else if (
    loweredMessage.includes("property") ||
    loweredMessage.includes("type")
  ) {
    draft.push("1. Inspect the type contract for the object being accessed.");
    draft.push("2. Add null/undefined guards if the value is optional.");
    draft.push(
      "3. Update the accessed property name or align the source type with the actual response shape.",
    );
  } else if (
    loweredMessage.includes("syntax") ||
    loweredMessage.includes("unexpected")
  ) {
    draft.push(
      "1. Inspect the failing line and adjacent lines for syntax mismatches.",
    );
    draft.push("2. Run formatter/linter after correction.");
    draft.push("3. Re-run the command to confirm parse recovery.");
  } else if (
    loweredMessage.includes("permission") ||
    loweredMessage.includes("access denied")
  ) {
    draft.push(
      "1. Verify the command or path is allowed by local debugger policy.",
    );
    draft.push("2. Confirm trusted workflow requirements are satisfied.");
    draft.push("3. Retry only after compliance is confirmed.");
  } else {
    draft.push(
      "1. Reproduce the issue with the smallest possible command or input.",
    );
    draft.push("2. Inspect the failing line and the surrounding block.");
    draft.push(
      "3. Apply the minimal code change needed, then re-run the same workflow.",
    );
  }

  if (sourceCode.trim()) {
    const lines = sourceCode.split("\n");
    const excerptStart = Math.max(issue.line - 2, 0);
    const excerptEnd = Math.min(issue.line + 1, lines.length);
    draft.push("");
    draft.push("Local Excerpt:");
    for (let i = excerptStart; i < excerptEnd; i += 1) {
      draft.push(`${i + 1}: ${lines[i]}`);
    }
  }

  return draft.join("\n");
}

function summarizeAllIssues(issues: ParsedIssue[]): string {
  if (issues.length === 0) {
    return "No structured issues were parsed from terminal output. Run a command that produces output, then parse issues.";
  }

  const counts = issues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { info: 0, warning: 0, error: 0, critical: 0 },
  );

  const topIssues = issues.slice(0, 5).map((issue) => {
    return `- ${issue.severity.toUpperCase()} ${issue.file}:${issue.line}:${issue.column} — ${issue.message}`;
  });

  return [
    `Parsed ${issues.length} issues total.`,
    `Critical: ${counts.critical} | Error: ${counts.error} | Warning: ${counts.warning} | Info: ${counts.info}`,
    "Top Issues:",
    ...topIssues,
  ].join("\n");
}

export default function DebugConsolePage() {
  const [sourcePath, setSourcePath] = useState("");
  const [sourceCode, setSourceCode] = useState("");
  const [directoryListing, setDirectoryListing] = useState<DirectoryEntry[]>(
    [],
  );
  const [terminalOutput, setTerminalOutput] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);

  const [processes, setProcesses] = useState<RunningProcess[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<RunningProcess | null>(
    null,
  );
  const [processSearch, setProcessSearch] = useState("");
  const [issues, setIssues] = useState<ParsedIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<ParsedIssue | null>(null);
  const [draftFix, setDraftFix] = useState("");
  const [commandInput, setCommandInput] = useState("test_debug");

  const sourceRef = useRef<HTMLPreElement>(null);

  const {
    output: commandOutput,
    isRunning: commandRunning,
    error: commandError,
    runCommand,
  } = useConsoleExecution();

  useEffect(() => {
    if (commandOutput) {
      setTerminalOutput(commandOutput);
    }
  }, [commandOutput]);

  useEffect(() => {
    if (commandError) {
      setAnalysis(`Execution error: ${commandError}`);
    }
  }, [commandError]);

  useEffect(() => {
    if (!selectedIssue || !sourceRef.current) return;

    const lineHeight = 22;
    const scrollTo = Math.max(selectedIssue.line - 5, 0) * lineHeight;
    sourceRef.current.scrollTop = scrollTo;
  }, [selectedIssue]);

  const filteredProcesses = useMemo(() => {
    const query = processSearch.trim().toLowerCase();
    if (!query) return processes;

    return processes.filter((proc) => {
      const nameMatch = String(proc.name || "")
        .toLowerCase()
        .includes(query);
      const exeMatch = String(proc.exe || "")
        .toLowerCase()
        .includes(query);
      const pidMatch = String(proc.pid || "").includes(query);

      return nameMatch || exeMatch || pidMatch;
    });
  }, [processes, processSearch]);

  const pickFile = async () => {
    if (!window.ipcRenderer?.invoke) {
      alert("File picker is only available in the Electron app.");
      return;
    }

    const selected = (await window.ipcRenderer.invoke("pick-source-file")) as
      | string
      | null;

    if (!selected) return;
    await inspectPath(selected);
  };

  const inspectPath = async (pathOverride?: string) => {
    const targetPath = (pathOverride ?? sourcePath).trim();
    if (!targetPath) {
      setAnalysis("Enter a file path first.");
      return;
    }

    setLoading(true);
    setDraftFix("");

    try {
      const result = await readDebugFile(targetPath);

      if (!result.ok) {
        setSourceCode("");
        setDirectoryListing([]);
        setAnalysis(result.error || "Failed to load file.");
        return;
      }

      setSourcePath(result.path || targetPath);
      setSourceCode(result.content || "");
      setDirectoryListing([]);
      setAnalysis(`File loaded successfully: ${result.path || targetPath}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunCommand = async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) {
      setAnalysis("Enter a command first.");
      return;
    }

    setAnalysis("");
    const cwd =
      sourcePath && sourcePath.includes("\\")
        ? sourcePath.substring(0, sourcePath.lastIndexOf("\\"))
        : undefined;

    await runCommand(trimmed, cwd);
  };

  const scanProcesses = async () => {
    setLoading(true);

    try {
      const result = await listDebugProcesses();

      if (result.ok) {
        setProcesses(result.processes || []);
        setAnalysis(
          `Loaded ${(result.processes || []).length} running processes.`,
        );
      } else {
        setAnalysis(result.error || "Failed to scan running programs.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeError = async () => {
    if (!terminalOutput.trim() && issues.length === 0) {
      setAnalysis(
        "No terminal output or parsed issues are available to analyze.",
      );
      return;
    }

    setLoading(true);

    try {
      const result = await analyzeDebugOutput(terminalOutput, issues);

      if (result.ok && result.analysis) {
        setAnalysis(result.analysis);
      } else {
        const parsed =
          issues.length > 0
            ? issues
            : parseIssuesFromTerminalOutput(terminalOutput);
        setIssues(parsed);
        if (parsed.length > 0 && !selectedIssue) {
          setSelectedIssue(parsed[0]);
        }
        setAnalysis(summarizeAllIssues(parsed));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleParseIssues = async () => {
    if (!terminalOutput.trim()) {
      setAnalysis("No terminal output available to parse.");
      return;
    }

    setLoading(true);

    try {
      const result = await parseDebugIssues(terminalOutput);
      const parsed =
        result.ok && result.issues.length > 0
          ? result.issues
          : parseIssuesFromTerminalOutput(terminalOutput);

      setIssues(parsed);
      setSelectedIssue(parsed.length > 0 ? parsed[0] : null);
      setAnalysis(
        parsed.length > 0
          ? summarizeAllIssues(parsed)
          : "No structured issues were detected in terminal output.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeSelectedIssue = async () => {
    if (!selectedIssue) {
      setAnalysis("Select an issue first.");
      return;
    }

    setLoading(true);

    try {
      const result = await analyzeSelectedIssue(
        selectedIssue,
        sourceCode,
        sourcePath,
      );

      if (result.ok && result.analysis) {
        setAnalysis(result.analysis);
      } else {
        setAnalysis(analyzeIssueLocally(selectedIssue, sourceCode, sourcePath));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDraftFix = async () => {
    if (!selectedIssue) {
      setDraftFix("Select an issue first.");
      return;
    }

    if (!sourceCode.trim()) {
      setDraftFix(
        "No source code loaded. Select an issue and load its file first.",
      );
      return;
    }

    setLoading(true);

    try {
      const result = await draftFixForIssue(
        selectedIssue,
        sourceCode,
        sourcePath,
      );

      if (result.ok && result.draft_fix) {
        setDraftFix(result.draft_fix);
      } else {
        setDraftFix(buildDraftFixLocally(selectedIssue, sourceCode));
      }
    } finally {
      setLoading(false);
    }
  };

  const copyDraftFix = async () => {
    if (!draftFix.trim()) {
      setAnalysis("No draft fix available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(draftFix);
      setAnalysis("Draft fix copied to clipboard.");
    } catch {
      setAnalysis("Failed to copy draft fix.");
    }
  };

  const loadSelectedIssueFile = async () => {
    if (!selectedIssue?.file) {
      setAnalysis("No issue file selected.");
      return;
    }

    await inspectPath(selectedIssue.file);
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-white">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h1 className="text-xl font-bold text-green-400">
              Vansant Debug Console
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Load source files, scan running programs, run debugger commands,
              parse issues, analyze selected issues, and generate focused draft
              fixes using the active VansantPlatform backend.
            </p>

            <div className="mt-4 grid gap-3">
              <input
                type="text"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="Enter a full file path..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
              />

              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Enter an allowed debug command..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={pickFile}
                className="rounded-lg bg-purple-500 px-3 py-2 text-sm text-white hover:bg-purple-600"
              >
                Open Source File
              </button>

              <button
                onClick={() => inspectPath()}
                className="rounded-lg bg-purple-500 px-3 py-2 text-sm text-white hover:bg-purple-600"
              >
                Load Typed File
              </button>

              <button
                onClick={scanProcesses}
                className="rounded-lg bg-purple-500 px-3 py-2 text-sm text-white hover:bg-purple-600"
              >
                Scan Running Programs
              </button>

              <button
                onClick={() => handleRunCommand(commandInput)}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Run Command
              </button>

              <button
                onClick={() => handleRunCommand("run_frontend")}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Run Frontend
              </button>

              <button
                onClick={() => handleRunCommand("build_frontend")}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Build Frontend
              </button>

              <button
                onClick={() => handleRunCommand("run_backend")}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Run Backend
              </button>

              <button
                onClick={() => handleRunCommand("lint_frontend")}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Lint Frontend
              </button>

              <button
                onClick={handleAnalyzeError}
                className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-white hover:bg-orange-600"
              >
                Analyze Output
              </button>

              <button
                onClick={handleParseIssues}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Parse Issues
              </button>

              <button
                onClick={handleAnalyzeSelectedIssue}
                disabled={!selectedIssue}
                className="rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
              >
                Analyze Selected Issue
              </button>

              <button
                onClick={handleDraftFix}
                className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-white hover:bg-orange-600"
              >
                Draft Fix
              </button>

              <button
                onClick={copyDraftFix}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Copy Draft Fix
              </button>

              <button
                onClick={loadSelectedIssueFile}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Load Selected Issue File
              </button>
            </div>

            {sourcePath && (
              <p className="mt-3 text-xs text-zinc-400">
                Current target: {sourcePath}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              Running Programs
            </h2>

            <input
              type="text"
              value={processSearch}
              onChange={(e) => setProcessSearch(e.target.value)}
              placeholder="Search by name, PID, or path..."
              className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />

            <div className="max-h-[220px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
              {filteredProcesses.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {processes.length === 0
                    ? "No process list loaded yet. Click ‘Scan Running Programs’."
                    : "No matching programs found."}
                </p>
              ) : (
                filteredProcesses.map((proc, index) => (
                  <button
                    key={`${proc.pid}-${proc.name}-${index}`}
                    type="button"
                    onClick={() => setSelectedProcess(proc)}
                    className={`mb-2 block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      selectedProcess?.pid === proc.pid
                        ? "border-purple-500 bg-zinc-800 text-white"
                        : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="font-medium">{proc.name || "Unknown"}</div>
                    <div className="text-zinc-500">PID: {proc.pid ?? "—"}</div>
                    {proc.exe ? (
                      <div className="truncate text-zinc-500">{proc.exe}</div>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            {selectedProcess && (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
                <div>
                  <span className="text-zinc-300">Selected:</span>{" "}
                  {selectedProcess.name || "Unknown"}
                </div>
                <div>
                  <span className="text-zinc-300">PID:</span>{" "}
                  {selectedProcess.pid ?? "—"}
                </div>
                <div className="break-all">
                  <span className="text-zinc-300">Path:</span>{" "}
                  {selectedProcess.exe || "Unavailable"}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-black p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              Terminal Output
            </h2>
            <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap text-sm text-green-300">
              {loading || commandRunning
                ? "Running..."
                : terminalOutput || "> Waiting for command output..."}
            </pre>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              Source Code Preview
            </h2>
            <pre
              ref={sourceRef}
              className="max-h-[300px] overflow-auto whitespace-pre-wrap text-sm text-zinc-200"
            >
              {sourceCode
                ? sourceCode.split("\n").map((line, index) => {
                    const lineNumber = index + 1;
                    const isIssueLine = selectedIssue?.line === lineNumber;

                    return (
                      <div
                        key={index}
                        className={
                          isIssueLine
                            ? "border-l-2 border-purple-500 bg-purple-900/40 px-2"
                            : "px-2"
                        }
                      >
                        <span className="mr-3 text-zinc-500">
                          {lineNumber.toString().padStart(3, " ")}
                        </span>
                        {line}
                      </div>
                    );
                  })
                : "No source code loaded yet."}
            </pre>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              Parsed Issues
            </h2>

            <div className="max-h-[250px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
              {issues.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No parsed issues yet. Run a command that produces actionable
                  output, then click Parse Issues.
                </p>
              ) : (
                issues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => {
                      setSelectedIssue(issue);
                      setAnalysis("");
                    }}
                    className={`mb-2 block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      selectedIssue?.id === issue.id
                        ? "border-purple-500 bg-zinc-800 text-white"
                        : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="font-medium">
                      {issue.severity.toUpperCase()} — {issue.message}
                    </div>
                    <div className="text-zinc-500">
                      {issue.file}:{issue.line}:{issue.column}
                    </div>
                    <div className="text-zinc-500">{issue.rule}</div>
                  </button>
                ))
              )}
            </div>

            {selectedIssue && (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
                <div>
                  <span className="text-zinc-300">File:</span>{" "}
                  {selectedIssue.file}
                </div>
                <div>
                  <span className="text-zinc-300">Line:</span>{" "}
                  {selectedIssue.line}
                </div>
                <div>
                  <span className="text-zinc-300">Column:</span>{" "}
                  {selectedIssue.column}
                </div>
                <div>
                  <span className="text-zinc-300">Severity:</span>{" "}
                  {selectedIssue.severity}
                </div>
                <div>
                  <span className="text-zinc-300">Rule:</span>{" "}
                  {selectedIssue.rule}
                </div>
                <div>
                  <span className="text-zinc-300">Message:</span>{" "}
                  {selectedIssue.message}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              Directory Listing
            </h2>
            <div className="max-h-[220px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              {directoryListing.length > 0 ? (
                <div className="space-y-2">
                  {directoryListing.map((entry, index) => (
                    <button
                      key={`${entry.path || entry.name || "entry"}-${index}`}
                      type="button"
                      onClick={() => {
                        if (entry.path && entry.is_file) {
                          void inspectPath(entry.path);
                        } else if (entry.path) {
                          setSourcePath(entry.path);
                          setAnalysis(
                            "Directory browsing is not active in the current backend. Load a file path directly.",
                          );
                        }
                      }}
                      className="block w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-left hover:bg-zinc-800"
                    >
                      <div className="font-medium text-zinc-200">
                        {entry.name || "Unknown"}
                      </div>
                      <div className="text-zinc-500">
                        {entry.is_dir ? "Directory" : "File"}
                      </div>
                      <div className="truncate text-zinc-500">
                        {entry.path || "—"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500">
                  No directory entries loaded. The current backend supports file
                  loading, not directory inspection.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              Fix Review
            </h2>
            <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap text-xs text-zinc-200">
              {draftFix || "Draft fix suggestions will appear here."}
            </pre>

            <button
              onClick={copyDraftFix}
              className="mt-3 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
            >
              Copy Draft Fix
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              SVANSAI Analysis
            </h2>
            <pre className="whitespace-pre-wrap text-sm text-zinc-200">
              {analysis ||
                "Analysis will appear here after you load a file, scan processes, parse issues, or analyze command output."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
