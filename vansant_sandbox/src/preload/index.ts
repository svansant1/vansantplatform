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

type RunResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
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

const sandboxApi = {
  openFolder: (): Promise<WorkspaceOpenResult> =>
    ipcRenderer.invoke("workspace:open-folder"),

  readFile: (filePath: string): Promise<{ path: string; content: string }> =>
    ipcRenderer.invoke("workspace:read-file", filePath),

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

  deleteEntry: (targetPath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("workspace:delete-entry", targetPath),

  refreshTree: (
    folderPath: string,
  ): Promise<{ folderPath: string; tree: FileNode[] }> =>
    ipcRenderer.invoke("workspace:refresh-tree", folderPath),

  runFile: (filePath: string, cwd?: string): Promise<RunResult> =>
    ipcRenderer.invoke("runner:run-file", { filePath, cwd }),

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