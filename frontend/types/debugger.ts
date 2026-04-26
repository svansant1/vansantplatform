export type ParsedIssueSeverity = "info" | "warning" | "error" | "critical";

export type ParsedIssueSource = "terminal" | "manual";

export type ParsedIssue = {
  id: string;
  file: string;
  line: number;
  column: number;
  severity: ParsedIssueSeverity;
  message: string;
  rule: string;
  source: ParsedIssueSource;
};

export type DebugRunResponse = {
  ok: boolean;
  command?: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  returncode?: number;
  pid?: number;
  message?: string;
  error?: string;
};

export type DebugAnalyzeResponse = {
  ok: boolean;
  analysis?: string;
  error?: string;
};

export type ParseIssuesResponse = {
  ok: boolean;
  issues: ParsedIssue[];
  error?: string;
};

export type DraftFixResponse = {
  ok: boolean;
  draft_fix?: string;
  error?: string;
};