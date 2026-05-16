export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
};

export type OpenTab = {
  path: string;
  name: string;
  content: string;
  kind: 'text' | 'image';
  imageSrc?: string;
  mimeType?: string;
  isDirty: boolean;
};

export type TrashEntry = {
  name: string;
  path: string;
  originalName: string;
  deletedAt: string | null;
  type: 'file' | 'directory';
};

export type RunResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type DiagnosticSummary = {
  errors: number;
  warnings: number;
};

export type GitStatus = {
  ok: boolean;
  isRepo: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  clean: boolean;
  summary: string;
};

export type SuggestedEdit = {
  id: string;
  filePath: string;
  originalText: string;
  replacementText: string;
  explanation: string;
  operation?: 'replace' | 'create';
};

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  suggestedEdits?: SuggestedEdit[];
};
