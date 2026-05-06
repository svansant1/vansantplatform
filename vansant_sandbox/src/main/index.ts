import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import * as pty from "node-pty";

const APP_NAME = "Vansant Sandbox";

const ALLOWED_RUN_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
  ".java",
]);

const HIDDEN_EXPLORER_ITEMS = new Set([
  ".DS_Store",
  ".git",
  "node_modules",
  "out",
  "release",
  "dist",
  "build",
  ".next",
  "coverage",
]);

function isDev(): boolean {
  return !app.isPackaged;
}

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "icon.ico");
  }

  return path.resolve(app.getAppPath(), "assets", "icon.ico");
}

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

type ReadFileResult = {
  path: string;
  content: string;
};

type WriteFilePayload = {
  path: string;
  content: string;
};

type CreateEntryPayload = {
  parentDir: string;
  name: string;
  type: "file" | "directory";
};

type RenameEntryPayload = {
  oldPath: string;
  newPath: string;
};

type RunFilePayload = {
  filePath: string;
  cwd?: string;
};

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
  shell: string;
  args?: string[];
};

type CreateTerminalPayload = {
  profileId?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
};

type ResizeTerminalPayload = {
  terminalId: string;
  cols: number;
  rows: number;
};

type WriteTerminalPayload = {
  terminalId: string;
  data: string;
};

type KillTerminalPayload = {
  terminalId: string;
};

type ManagedTerminal = {
  id: string;
  profileId: string;
  label: string;
  shell: string;
  ptyProcess: pty.IPty;
};

const terminals = new Map<string, ManagedTerminal>();

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function buildFileTree(dirPath: string): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const visible = entries.filter(
    (entry) =>
      !HIDDEN_EXPLORER_ITEMS.has(entry.name) &&
      !entry.name.toLowerCase().includes("backup"),
  );

  visible.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  return Promise.all(
    visible.map(async (entry) => {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: entryPath,
          type: "directory" as const,
          children: await buildFileTree(entryPath),
        };
      }

      return {
        name: entry.name,
        path: entryPath,
        type: "file" as const,
      };
    }),
  );
}

function getRunCommand(filePath: string): { command: string; args: string[] } {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".py":
      return { command: "python", args: [filePath] };

    case ".js":
    case ".mjs":
    case ".cjs":
      return { command: "node", args: [filePath] };

    case ".ts":
      return { command: "npx", args: ["tsx", filePath] };

    case ".java": {
      const cwd = path.dirname(filePath);
      const baseName = path.basename(filePath, ".java");

      return {
        command: "cmd",
        args: ["/c", `javac "${filePath}" && java -cp "${cwd}" ${baseName}`],
      };
    }

    default:
      throw new Error(`Unsupported run target: ${ext || "unknown extension"}`);
  }
}

async function runFile(payload: RunFilePayload): Promise<RunResult> {
  const normalizedPath = path.normalize(payload.filePath);
  const ext = path.extname(normalizedPath).toLowerCase();

  if (!ALLOWED_RUN_EXTENSIONS.has(ext)) {
    throw new Error(`This file type cannot be run yet: ${ext}`);
  }

  if (!(await pathExists(normalizedPath))) {
    throw new Error(`File does not exist: ${normalizedPath}`);
  }

  const { command, args } = getRunCommand(normalizedPath);

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: payload.cwd || path.dirname(normalizedPath),
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        command: `${command} ${args.join(" ")}`,
        stdout,
        stderr,
        exitCode: code,
      });
    });
  });
}

function getWindowsTerminalProfiles(): TerminalProfile[] {
  const profiles: TerminalProfile[] = [];

  const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  const powershell =
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const cmd = "C:\\Windows\\System32\\cmd.exe";
  const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
  const wsl = "C:\\Windows\\System32\\wsl.exe";

  if (existsSync(pwsh)) {
    profiles.push({
      id: "pwsh",
      label: "PowerShell",
      shell: pwsh,
      args: ["-NoLogo", "-NoProfile"],
    });
  } else if (existsSync(powershell)) {
    profiles.push({
      id: "powershell",
      label: "PowerShell",
      shell: powershell,
      args: ["-NoLogo", "-NoProfile"],
    });
  }

  if (existsSync(cmd)) {
    profiles.push({
      id: "cmd",
      label: "Command Prompt",
      shell: cmd,
    });
  }

  if (existsSync(gitBash)) {
    profiles.push({
      id: "git-bash",
      label: "Git Bash",
      shell: gitBash,
      args: ["--login", "-i"],
    });
  }

  if (existsSync(wsl)) {
    profiles.push({
      id: "wsl",
      label: "WSL",
      shell: wsl,
    });
  }

  return profiles;
}

function getTerminalProfiles(): TerminalProfile[] {
  if (process.platform === "win32") {
    return getWindowsTerminalProfiles();
  }

  return [
    {
      id: "shell",
      label: "Shell",
      shell: process.env.SHELL || "/bin/bash",
    },
  ];
}

function createTerminalId(): string {
  return `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createTerminal(
  senderWindow: BrowserWindow,
  payload: CreateTerminalPayload,
) {
  const profiles = getTerminalProfiles();
  const profile =
    profiles.find((item) => item.id === payload.profileId) ?? profiles[0];

  if (!profile) {
    throw new Error("No terminal profiles are available on this machine.");
  }

  const terminalId = createTerminalId();
  const cwd = payload.cwd || os.homedir();
  const cols = payload.cols && payload.cols > 0 ? payload.cols : 120;
  const rows = payload.rows && payload.rows > 0 ? payload.rows : 30;

  const ptyProcess = pty.spawn(profile.shell, profile.args ?? [], {
    name: "xterm-color",
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      POWERSHELL_UPDATECHECK: "OFF",
    },
  });

  const managed: ManagedTerminal = {
    id: terminalId,
    profileId: profile.id,
    label: profile.label,
    shell: profile.shell,
    ptyProcess,
  };

  terminals.set(terminalId, managed);

  ptyProcess.onData((data) => {
    senderWindow.webContents.send("terminal:data", {
      terminalId,
      data,
    });
  });

  ptyProcess.onExit(({ exitCode }) => {
    senderWindow.webContents.send("terminal:exit", {
      terminalId,
      exitCode,
    });

    terminals.delete(terminalId);
  });

  return {
    terminalId,
    profileId: profile.id,
    label: profile.label,
    shell: profile.shell,
    cwd,
  };
}

function createMainWindow(): BrowserWindow {
  const iconPath = getIconPath();

  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#0a0b10",
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev()) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

app.whenReady().then(() => {
  const mainWindow = createMainWindow();

  ipcMain.handle("workspace:open-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open Folder",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const folderPath = result.filePaths[0];
    const tree = await buildFileTree(folderPath);

    return {
      folderPath,
      tree,
    };
  });

  ipcMain.handle(
    "workspace:read-file",
    async (_event, filePath: string): Promise<ReadFileResult> => {
      const normalizedPath = path.normalize(filePath);
      const content = await fs.readFile(normalizedPath, "utf8");

      return {
        path: normalizedPath,
        content,
      };
    },
  );

  ipcMain.handle(
    "workspace:write-file",
    async (_event, payload: WriteFilePayload) => {
      const normalizedPath = path.normalize(payload.path);
      await fs.writeFile(normalizedPath, payload.content, "utf8");

      return {
        ok: true,
        path: normalizedPath,
      };
    },
  );

  ipcMain.handle(
    "workspace:create-entry",
    async (_event, payload: CreateEntryPayload) => {
      const safeName = payload.name.trim();

      if (!safeName) {
        throw new Error("Name cannot be empty.");
      }

      if (safeName.includes("..") || safeName.includes("/") || safeName.includes("\\")) {
        throw new Error("Name cannot contain path separators or traversal.");
      }

      const targetPath = path.join(payload.parentDir, safeName);

      if (await pathExists(targetPath)) {
        throw new Error(`An entry already exists at ${targetPath}`);
      }

      if (payload.type === "directory") {
        await fs.mkdir(targetPath, { recursive: false });
      } else {
        await fs.writeFile(targetPath, "", { encoding: "utf8", flag: "wx" });
      }

      return {
        ok: true,
        path: targetPath,
      };
    },
  );

  ipcMain.handle(
    "workspace:rename-entry",
    async (_event, payload: RenameEntryPayload) => {
      const oldPath = path.normalize(payload.oldPath);
      const newPath = path.normalize(payload.newPath);

      if (await pathExists(newPath)) {
        throw new Error(`An entry already exists at ${newPath}`);
      }

      await fs.rename(oldPath, newPath);

      return {
        ok: true,
        path: newPath,
      };
    },
  );

  ipcMain.handle("workspace:delete-entry", async (_event, targetPath: string) => {
    const normalizedPath = path.normalize(targetPath);
    await fs.rm(normalizedPath, { recursive: true, force: true });

    return {
      ok: true,
    };
  });

  ipcMain.handle("workspace:refresh-tree", async (_event, folderPath: string) => {
    const tree = await buildFileTree(folderPath);

    return {
      folderPath,
      tree,
    };
  });

  ipcMain.handle("runner:run-file", async (_event, payload: RunFilePayload) => {
    return runFile(payload);
  });

  ipcMain.handle("terminal:list-profiles", async () => {
    return getTerminalProfiles().map((profile) => ({
      id: profile.id,
      label: profile.label,
    }));
  });

  ipcMain.handle(
    "terminal:create",
    async (_event, payload: CreateTerminalPayload) => {
      return createTerminal(mainWindow, payload);
    },
  );

  ipcMain.handle(
    "terminal:write",
    async (_event, payload: WriteTerminalPayload) => {
      const terminal = terminals.get(payload.terminalId);

      if (!terminal) {
        throw new Error(`Terminal not found: ${payload.terminalId}`);
      }

      terminal.ptyProcess.write(payload.data);

      return {
        ok: true,
      };
    },
  );

  ipcMain.handle(
    "terminal:resize",
    async (_event, payload: ResizeTerminalPayload) => {
      const terminal = terminals.get(payload.terminalId);

      if (!terminal) {
        throw new Error(`Terminal not found: ${payload.terminalId}`);
      }

      terminal.ptyProcess.resize(payload.cols, payload.rows);

      return {
        ok: true,
      };
    },
  );

  ipcMain.handle(
    "terminal:kill",
    async (_event, payload: KillTerminalPayload) => {
      const terminal = terminals.get(payload.terminalId);

      if (!terminal) {
        return {
          ok: true,
        };
      }

      terminal.ptyProcess.kill();
      terminals.delete(payload.terminalId);

      return {
        ok: true,
      };
    },
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});