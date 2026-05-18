import { contextBridge, ipcRenderer } from "electron";

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

type WorkspaceOpenResult = {
  folderPath: string;
  tree: FileNode[];
} | null;

type TrashEntry = {
  name: string;
  path: string;
  originalName: string;
  deletedAt: string | null;
  type: "file" | "directory";
};

type RunResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

type GitStatusResult = {
  ok: boolean;
  isRepo: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  clean: boolean;
  summary: string;
};

type TerminalProfile = {
  id: string;
  label: string;
};

type CreatedTerminal = {
  terminalId: string;
  profileId: string;
  label: string;
  shell: string;
  cwd: string;
};

type AssistantFileContext = {
  path: string;
  content: string;
};

type AssistantOpenFile = {
  path: string;
  name: string;
  kind?: "text" | "image";
  content?: string;
  isActive?: boolean;
};

type AssistantRequestPayload = {
  message: string;
  currentFile?: AssistantFileContext | null;
  openFiles?: AssistantOpenFile[];
  terminalOutput?: string;
};

type SuggestedEdit = {
  id: string;
  filePath: string;
  originalText: string;
  replacementText: string;
  explanation: string;
  operation?: "replace" | "create";
};

type AssistantResponse = {
  message: string;
  suggestedEdits: SuggestedEdit[];
  provider: string;
};

type ApplyAssistantEditsResult = {
  ok: boolean;
  results: Array<{ filePath: string; ok: boolean; message: string }>;
};

const sandboxApi = {
  openFolder: (): Promise<WorkspaceOpenResult> =>
    ipcRenderer.invoke("workspace:open-folder"),

  readFile: (filePath: string): Promise<{ path: string; content: string }> =>
    ipcRenderer.invoke("workspace:read-file", filePath),

  readImage: (
    filePath: string,
  ): Promise<{ path: string; dataUrl: string; mimeType: string }> =>
    ipcRenderer.invoke("workspace:read-image", filePath),

  writeFile: (
    path: string,
    content: string,
  ): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke("workspace:write-file", { path, content }),

  createEntry: (
    parentDir: string,
    name: string,
    type: "file" | "directory",
  ): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke("workspace:create-entry", { parentDir, name, type }),

  renameEntry: (
    oldPath: string,
    newPath: string,
  ): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke("workspace:rename-entry", { oldPath, newPath }),

  deleteEntry: (
    targetPath: string,
  ): Promise<{ ok: boolean; trashPath: string }> =>
    ipcRenderer.invoke("workspace:delete-entry", targetPath),

  listTrash: (): Promise<TrashEntry[]> =>
    ipcRenderer.invoke("workspace:list-trash"),

  restoreTrashEntry: (
    trashPath: string,
    restoreName?: string,
  ): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke("workspace:restore-trash-entry", {
      trashPath,
      restoreName,
    }),

  refreshTree: (
    folderPath: string,
  ): Promise<{ folderPath: string; tree: FileNode[] }> =>
    ipcRenderer.invoke("workspace:refresh-tree", folderPath),

  runFile: (filePath: string, cwd?: string): Promise<RunResult> =>
    ipcRenderer.invoke("runner:run-file", { filePath, cwd }),

  getGitStatus: (folderPath: string): Promise<GitStatusResult> =>
    ipcRenderer.invoke("git:status", folderPath),

  askAssistant: (payload: AssistantRequestPayload): Promise<AssistantResponse> =>
    ipcRenderer.invoke("assistant:ask", payload),

  applyAssistantEdits: (
    edits: SuggestedEdit[],
  ): Promise<ApplyAssistantEditsResult> =>
    ipcRenderer.invoke("assistant:apply-edits", { edits }),

  openExternalUrl: (url: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("shell:open-external-url", url),

  listTerminalProfiles: (): Promise<TerminalProfile[]> =>
    ipcRenderer.invoke("terminal:list-profiles"),

  createTerminal: (
    profileId?: string,
    cwd?: string,
    cols?: number,
    rows?: number,
  ): Promise<CreatedTerminal> =>
    ipcRenderer.invoke("terminal:create", { profileId, cwd, cols, rows }),

  writeTerminal: (terminalId: string, data: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("terminal:write", { terminalId, data }),

  resizeTerminal: (
    terminalId: string,
    cols: number,
    rows: number,
  ): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("terminal:resize", { terminalId, cols, rows }),

  killTerminal: (terminalId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("terminal:kill", { terminalId }),

  onWorkspaceChanged: (callback: (payload: { folderPath: string; changedPath: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { folderPath: string; changedPath: string },
    ) => callback(payload);

    ipcRenderer.on("workspace:changed", listener);

    return () => {
      ipcRenderer.removeListener("workspace:changed", listener);
    };
  },

  onTerminalData: (callback: (payload: { terminalId: string; data: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { terminalId: string; data: string },
    ) => callback(payload);

    ipcRenderer.on("terminal:data", listener);

    return () => {
      ipcRenderer.removeListener("terminal:data", listener);
    };
  },

  onTerminalExit: (callback: (payload: { terminalId: string; exitCode: number }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { terminalId: string; exitCode: number },
    ) => callback(payload);

    ipcRenderer.on("terminal:exit", listener);

    return () => {
      ipcRenderer.removeListener("terminal:exit", listener);
    };
  },
};

contextBridge.exposeInMainWorld("sandboxApi", sandboxApi);

export type SandboxApi = typeof sandboxApi;
