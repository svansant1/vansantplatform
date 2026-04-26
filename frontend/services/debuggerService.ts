import type {
  DebugAnalyzeResponse,
  DebugRunResponse,
  DraftFixResponse,
  ParseIssuesResponse,
  ParsedIssue,
} from "../types/debugger";

const API_BASE_URL = "process.env.NEXT_PUBLIC_API_BASE_URL";

function normalizeDebugRunResponse(
  payload: Partial<DebugRunResponse> | null | undefined,
): DebugRunResponse {
  return {
    ok: Boolean(payload?.ok),
    command: payload?.command ?? "",
    cwd: payload?.cwd ?? "",
    stdout: payload?.stdout ?? "",
    stderr: payload?.stderr ?? "",
    returncode:
      typeof payload?.returncode === "number" ? payload.returncode : undefined,
    pid: typeof payload?.pid === "number" ? payload.pid : undefined,
    message: payload?.message ?? "",
    error: payload?.error ?? undefined,
  };
}

function normalizeIssue(payload: Partial<ParsedIssue>): ParsedIssue {
  const severity =
    payload.severity === "info" ||
    payload.severity === "warning" ||
    payload.severity === "error" ||
    payload.severity === "critical"
      ? payload.severity
      : "error";

  const source =
    payload.source === "terminal" || payload.source === "manual"
      ? payload.source
      : "terminal";

  return {
    id: payload.id ?? "",
    file: payload.file ?? "",
    line: typeof payload.line === "number" ? payload.line : 0,
    column: typeof payload.column === "number" ? payload.column : 0,
    severity,
    message: payload.message ?? "",
    rule: payload.rule ?? "",
    source,
  };
}

function normalizeParseIssuesResponse(
  payload: Partial<ParseIssuesResponse> | null | undefined,
): ParseIssuesResponse {
  return {
    ok: Boolean(payload?.ok),
    issues: Array.isArray(payload?.issues)
      ? payload.issues.map((issue) => normalizeIssue(issue))
      : [],
    error: payload?.error ?? undefined,
  };
}

function normalizeAnalyzeResponse(
  payload: Partial<DebugAnalyzeResponse> | null | undefined,
): DebugAnalyzeResponse {
  return {
    ok: Boolean(payload?.ok),
    analysis: payload?.analysis ?? "",
    error: payload?.error ?? undefined,
  };
}

function normalizeDraftFixResponse(
  payload: Partial<DraftFixResponse> | null | undefined,
): DraftFixResponse {
  return {
    ok: Boolean(payload?.ok),
    draft_fix: payload?.draft_fix ?? "",
    error: payload?.error ?? undefined,
  };
}

export async function runDebugCommand(
  command: string,
  cwd?: string,
): Promise<DebugRunResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debug/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command,
        cwd: cwd ?? null,
      }),
    });

    const data = await response.json();
    return normalizeDebugRunResponse(data);
  } catch (error) {
    return normalizeDebugRunResponse({
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to run debug command.",
    });
  }
}

export async function analyzeDebugOutput(
  terminalOutput: string,
  issues: ParsedIssue[] = [],
): Promise<DebugAnalyzeResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debug/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminal_output: terminalOutput,
        issues,
      }),
    });

    const data = await response.json();
    return normalizeAnalyzeResponse(data);
  } catch (error) {
    return normalizeAnalyzeResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to analyze debug output.",
    });
  }
}

export async function parseDebugIssues(
  terminalOutput: string,
): Promise<ParseIssuesResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debug/parse-issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminal_output: terminalOutput,
      }),
    });

    const data = await response.json();
    return normalizeParseIssuesResponse(data);
  } catch (error) {
    return normalizeParseIssuesResponse({
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to parse issues.",
    });
  }
}

export async function analyzeSelectedIssue(
  issue: ParsedIssue,
  sourceCode: string,
  filePath: string,
): Promise<DebugAnalyzeResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debug/analyze-issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        issue,
        source_code: sourceCode,
        file_path: filePath,
      }),
    });

    const data = await response.json();
    return normalizeAnalyzeResponse(data);
  } catch (error) {
    return normalizeAnalyzeResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to analyze selected issue.",
    });
  }
}

export async function draftFixForIssue(
  issue: ParsedIssue,
  sourceCode: string,
  filePath: string,
): Promise<DraftFixResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debug/draft-fix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        issue,
        source_code: sourceCode,
        file_path: filePath,
      }),
    });

    const data = await response.json();
    return normalizeDraftFixResponse(data);
  } catch (error) {
    return normalizeDraftFixResponse({
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to draft fix.",
    });
  }
}