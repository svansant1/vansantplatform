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
