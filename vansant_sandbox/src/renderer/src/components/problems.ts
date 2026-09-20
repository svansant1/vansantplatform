import type { FileDiagnostics, Problem, RunResult } from "./types";

type EditorMarker = {
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source?: string;
  code?: string | { value: string };
};

export function collectEditorDiagnostics(file: string, markers: EditorMarker[]): FileDiagnostics {
  const problems: Problem[] = markers
    .filter((marker) => marker.severity === 8 || marker.severity === 4)
    .map((marker) => ({
      file,
      line: marker.startLineNumber,
      column: marker.startColumn,
      endLine: marker.endLineNumber,
      endColumn: marker.endColumn,
      severity: marker.severity === 8 ? "error" : "warning",
      message: marker.message,
      source: marker.source,
      code: typeof marker.code === "string" ? marker.code : marker.code?.value,
    }));

  problems.sort((a, b) => (a.line! - b.line!) || (a.column! - b.column!));
  return {
    errors: problems.filter((problem) => problem.severity === "error").length,
    warnings: problems.filter((problem) => problem.severity === "warning").length,
    problems,
  };
}

export function parseRunProblems(result: RunResult | null): Problem[] {
  if (!result) return [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const output = `${result.stderr}\n${result.stdout}`.replace(/\u001b\[[0-9;]*m/g, "");
  const lines = output.split(/\r?\n/);
  const add = (problem: Problem) => {
    if (problem.file && /^<(?:string|editor|stdin)>$|^\[eval\]$/.test(problem.file)) {
      problem.file = result.filePath;
    }
    const key = JSON.stringify(problem);
    if (!seen.has(key)) {
      seen.add(key);
      problems.push(problem);
    }
  };

  // A Python frame is followed by source code; the exception below it explains the failure.
  let pythonFrame: { file: string; line: number } | undefined;
  let jsLocation: { file: string; line: number; column?: number } | undefined;
  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const python = line.match(/^File "(.+?)", line (\d+)(?:, in .*)?$/);
    if (python) {
      pythonFrame = { file: python[1], line: Number(python[2]) };
      continue;
    }
    const exception = line.match(/^(?:[\w.]+(?:Error|Exception)|Error|Exception|KeyboardInterrupt|SystemExit)(?::.*)?$/);
    if (exception) {
      if (pythonFrame) {
        add({ ...pythonFrame, severity: "error", message: line, source: "Python" });
        pythonFrame = undefined;
      } else {
        // JavaScript stack frames usually follow the exception; syntax locations precede it.
        const stack = lines.slice(lineIndex + 1).map((candidate) =>
          candidate.trim().match(/^at (?:.*?\()?(.+?):(\d+):(\d+)\)?$/),
        ).find((match) => match && !match[1].startsWith("node:"));
        add({
          ...(jsLocation ?? (stack ? { file: stack[1], line: Number(stack[2]), column: Number(stack[3]) } : {})),
          severity: "error", message: line,
        });
      }
      jsLocation = undefined;
      continue;
    }
    const ts = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/i);
    if (ts) {
      add({ file: ts[1], line: Number(ts[2]), column: Number(ts[3]), severity: ts[4].toLowerCase() === "warning" ? "warning" : "error", code: ts[5], message: ts[6] });
      continue;
    }
    const compiler = line.match(/^(.+?):(\d+)(?::(\d+))?:\s+(error|warning)(?:\s+[^:]+)?:\s+(.+)$/i);
    if (compiler) {
      add({ file: compiler[1], line: Number(compiler[2]), column: compiler[3] ? Number(compiler[3]) : undefined, severity: compiler[4].toLowerCase() === "warning" ? "warning" : "error", message: compiler[5] });
      continue;
    }
    const generic = line.match(/^(.+?):(\d+):(\d+):\s+(.+)$/);
    if (generic) {
      add({ file: generic[1], line: Number(generic[2]), column: Number(generic[3]), severity: /warning/i.test(generic[4]) ? "warning" : "error", message: generic[4] });
      continue;
    }
    const location = line.match(/^(.+?):(\d+)$/);
    if (location) jsLocation = { file: location[1], line: Number(location[2]) };
  }
  if (problems.length === 0 && !result.ok) {
    add({ severity: "error", message: result.stderr.trim() || result.stdout.trim() || "The run stopped without an error message." });
  }
  return problems;
}
