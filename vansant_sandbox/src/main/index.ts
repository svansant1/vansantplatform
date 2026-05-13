import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { deflateSync } from "node:zlib";
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
  ".sandbox-trash",
  "node_modules",
  "out",
  "release",
  "dist",
  "build",
  ".next",
  "coverage",
]);

const TRASH_FOLDER_NAME = ".sandbox-trash";
const MAX_EDITOR_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 4096;
const SVANSAI_ASSISTANT_TIMEOUT_MS = 25000;

const IMAGE_MIME_TYPES = new Map([
  [".apng", "image/apng"],
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpe", "image/jpeg"],
  [".jfif", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".pjp", "image/jpeg"],
  [".pjpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function isDev(): boolean {
  return !app.isPackaged;
}

function assertOpenableExternalUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") {
    throw new Error("URL must be a string.");
  }

  const parsedUrl = new URL(rawUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https links can be opened.");
  }

  return parsedUrl.href;
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

type TrashEntry = {
  name: string;
  path: string;
  originalName: string;
  deletedAt: string | null;
  type: "file" | "directory";
};

type ReadFileResult = {
  path: string;
  content: string;
};

type ReadImageResult = {
  path: string;
  dataUrl: string;
  mimeType: string;
};

type IcoFrame = {
  width: number;
  height: number;
  bitCount: number;
  size: number;
  offset: number;
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

type AssistantFileContext = {
  path: string;
  content: string;
};

type AssistantOpenFile = {
  path: string;
  name: string;
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
};

type AssistantResponse = {
  message: string;
  suggestedEdits: SuggestedEdit[];
  provider: string;
};

type ApplyAssistantEditsPayload = {
  edits: SuggestedEdit[];
};

type RestoreTrashPayload = {
  trashPath: string;
  restoreName?: string;
};

type ManagedTerminal = {
  id: string;
  profileId: string;
  label: string;
  shell: string;
  ptyProcess: pty.IPty;
};

const terminals = new Map<string, ManagedTerminal>();
let currentWorkspaceRoot: string | null = null;

function getSvansaiApiUrl(): string {
  return (
    process.env.SVANSAI_API_URL ||
    process.env.SVANSAI_ASSISTANT_URL ||
    "https://vansant-backend.onrender.com/ask"
  );
}

function killAllTerminals(): number {
  const terminalCount = terminals.size;

  for (const terminal of terminals.values()) {
    terminal.ptyProcess.kill();
  }

  terminals.clear();

  return terminalCount;
}

function normalizeForCompare(targetPath: string): string {
  const normalized = path.resolve(targetPath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const target = normalizeForCompare(targetPath);
  const root = normalizeForCompare(workspaceRoot);

  return target === root || target.startsWith(`${root}${path.sep}`);
}

function getWorkspaceRoot(): string {
  if (!currentWorkspaceRoot) {
    throw new Error("Open a workspace before using sandbox file actions.");
  }

  return currentWorkspaceRoot;
}

function assertInsideWorkspace(targetPath: string, label = "Path"): string {
  const workspaceRoot = getWorkspaceRoot();
  const resolvedPath = path.resolve(targetPath);

  if (!isInsideWorkspace(resolvedPath, workspaceRoot)) {
    throw new Error(`${label} is outside the opened workspace.`);
  }

  return resolvedPath;
}

async function assertExistingPathInsideWorkspace(
  targetPath: string,
  label = "Path",
): Promise<string> {
  const resolvedPath = assertInsideWorkspace(targetPath, label);

  if (!(await pathExists(resolvedPath))) {
    throw new Error(`${label} does not exist: ${resolvedPath}`);
  }

  return resolvedPath;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, BINARY_SNIFF_BYTES);

  return sample.includes(0);
}

function makeCrcTable(): number[] {
  const table: number[] = [];

  for (let i = 0; i < 256; i += 1) {
    let c = i;

    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[i] = c >>> 0;
  }

  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  const crcBuffer = Buffer.alloc(4);

  lengthBuffer.writeUInt32BE(data.length, 0);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodeRgbaPng(width: number, height: number, rgba: Buffer): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const header = Buffer.alloc(13);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    createPngChunk("IHDR", header),
    createPngChunk("IDAT", deflateSync(scanlines)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function parseIcoFrames(content: Buffer): IcoFrame[] {
  if (
    content.length < 6 ||
    content.readUInt16LE(0) !== 0 ||
    content.readUInt16LE(2) !== 1
  ) {
    throw new Error("This icon file is not a valid ICO image.");
  }

  const count = content.readUInt16LE(4);
  const frames: IcoFrame[] = [];

  for (let i = 0; i < count; i += 1) {
    const entryOffset = 6 + i * 16;

    if (entryOffset + 16 > content.length) break;

    const width = content[entryOffset] || 256;
    const height = content[entryOffset + 1] || 256;
    const bitCount = content.readUInt16LE(entryOffset + 6);
    const size = content.readUInt32LE(entryOffset + 8);
    const offset = content.readUInt32LE(entryOffset + 12);

    if (offset + size <= content.length) {
      frames.push({ width, height, bitCount, size, offset });
    }
  }

  return frames;
}

function decodeIcoBitmapFrame(content: Buffer, frame: IcoFrame): Buffer {
  const dib = content.subarray(frame.offset, frame.offset + frame.size);

  if (dib.length < 40 || dib.readUInt32LE(0) < 40) {
    throw new Error("This ICO frame uses an unsupported bitmap header.");
  }

  const width = dib.readInt32LE(4);
  const storedHeight = dib.readInt32LE(8);
  const planes = dib.readUInt16LE(12);
  const bitCount = dib.readUInt16LE(14);
  const compression = dib.readUInt32LE(16);
  const headerSize = dib.readUInt32LE(0);
  const height = Math.abs(storedHeight) / 2;

  if (
    width !== frame.width ||
    height !== frame.height ||
    planes !== 1 ||
    bitCount !== 32 ||
    compression !== 0
  ) {
    throw new Error("This ICO bitmap frame is not supported for preview yet.");
  }

  const pixelOffset = headerSize;
  const rowBytes = width * 4;
  const requiredBytes = pixelOffset + rowBytes * height;

  if (requiredBytes > dib.length) {
    throw new Error("This ICO bitmap frame is incomplete.");
  }

  const rgba = Buffer.alloc(width * height * 4);
  const isBottomUp = storedHeight > 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = isBottomUp ? height - 1 - y : y;
    const sourceRow = pixelOffset + sourceY * rowBytes;
    const targetRow = y * rowBytes;

    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + x * 4;
      const target = targetRow + x * 4;

      rgba[target] = dib[source + 2];
      rgba[target + 1] = dib[source + 1];
      rgba[target + 2] = dib[source];
      rgba[target + 3] = dib[source + 3];
    }
  }

  return encodeRgbaPng(width, height, rgba);
}

function decodeIcoToPng(content: Buffer): Buffer {
  const frames = parseIcoFrames(content).sort((a, b) => {
    const areaDiff = b.width * b.height - a.width * a.height;
    return areaDiff || b.bitCount - a.bitCount;
  });

  for (const frame of frames) {
    const frameContent = content.subarray(frame.offset, frame.offset + frame.size);
    const isPng =
      frameContent.length >= 8 &&
      frameContent[0] === 0x89 &&
      frameContent[1] === 0x50 &&
      frameContent[2] === 0x4e &&
      frameContent[3] === 0x47;

    if (isPng) return frameContent;

    try {
      return decodeIcoBitmapFrame(content, frame);
    } catch {
      // Try the next icon frame before giving up.
    }
  }

  throw new Error("This ICO file does not contain a previewable image frame.");
}

async function readTextFileForEditor(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);

  if (!stats.isFile()) {
    throw new Error("Only files can be opened in the editor.");
  }

  if (stats.size > MAX_EDITOR_FILE_BYTES) {
    throw new Error(
      `File is too large to open safely (${formatFileSize(
        stats.size,
      )}). Limit: ${formatFileSize(MAX_EDITOR_FILE_BYTES)}.`,
    );
  }

  const content = await fs.readFile(filePath);

  if (looksBinary(content)) {
    throw new Error("This looks like a binary file, so Sandbox did not open it in the text editor.");
  }

  return content.toString("utf8");
}

async function readImageForPreview(filePath: string): Promise<ReadImageResult> {
  const stats = await fs.stat(filePath);

  if (!stats.isFile()) {
    throw new Error("Only files can be opened in the image preview.");
  }

  if (stats.size > MAX_IMAGE_PREVIEW_BYTES) {
    throw new Error(
      `Image is too large to preview safely (${formatFileSize(
        stats.size,
      )}). Limit: ${formatFileSize(MAX_IMAGE_PREVIEW_BYTES)}.`,
    );
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES.get(ext);

  if (!mimeType) {
    throw new Error(`This image type is not supported yet: ${ext || "unknown"}`);
  }

  const content = await fs.readFile(filePath);

  if (ext === ".ico") {
    const png = decodeIcoToPng(content);

    return {
      path: filePath,
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      mimeType: "image/png",
    };
  }

  return {
    path: filePath,
    dataUrl: `data:${mimeType};base64,${content.toString("base64")}`,
    mimeType,
  };
}

function getWorkspaceTrashRoot(): string {
  return assertInsideWorkspace(
    path.join(getWorkspaceRoot(), TRASH_FOLDER_NAME),
    "Trash folder",
  );
}

function createTrashName(originalPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${path.basename(originalPath)}.${timestamp}`;
}

async function createUniqueTrashPath(originalPath: string): Promise<string> {
  const trashRoot = getWorkspaceTrashRoot();
  const baseName = createTrashName(originalPath);
  let candidate = assertInsideWorkspace(
    path.join(trashRoot, baseName),
    "Trash target",
  );
  let counter = 1;

  while (await pathExists(candidate)) {
    candidate = assertInsideWorkspace(
      path.join(trashRoot, `${baseName}.${counter}`),
      "Trash target",
    );
    counter += 1;
  }

  return candidate;
}

async function moveToWorkspaceTrash(targetPath: string): Promise<string> {
  const normalizedPath = await assertExistingPathInsideWorkspace(
    targetPath,
    "Delete target",
  );
  const trashRoot = getWorkspaceTrashRoot();

  if (isInsideWorkspace(normalizedPath, trashRoot)) {
    throw new Error("Items already in Sandbox trash cannot be deleted here.");
  }

  await fs.mkdir(trashRoot, { recursive: true });

  const trashPath = await createUniqueTrashPath(normalizedPath);
  await fs.rename(normalizedPath, trashPath);

  return trashPath;
}

function parseTrashName(trashName: string): {
  originalName: string;
  deletedAt: string | null;
} {
  const match = trashName.match(
    /^(.*)\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:\.\d+)?$/,
  );

  if (!match) {
    return {
      originalName: trashName,
      deletedAt: null,
    };
  }

  const [, originalName, rawTimestamp] = match;
  const deletedAt = rawTimestamp.replace(
    /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/,
    "$1$2:$3:$4.$5",
  );

  return {
    originalName,
    deletedAt,
  };
}

async function listWorkspaceTrash(): Promise<TrashEntry[]> {
  const trashRoot = getWorkspaceTrashRoot();

  if (!(await pathExists(trashRoot))) {
    return [];
  }

  const entries = await fs.readdir(trashRoot, { withFileTypes: true });
  const trashEntries = entries.map((entry) => {
    const parsed = parseTrashName(entry.name);

    return {
      name: entry.name,
      path: assertInsideWorkspace(path.join(trashRoot, entry.name), "Trash item"),
      originalName: parsed.originalName,
      deletedAt: parsed.deletedAt,
      type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
    };
  });

  trashEntries.sort((a, b) => b.name.localeCompare(a.name));

  return trashEntries;
}

function createRestoreCandidate(root: string, fileName: string, index: number) {
  if (index === 0) {
    return path.join(root, fileName);
  }

  const ext = path.extname(fileName);
  const baseName = ext ? fileName.slice(0, -ext.length) : fileName;

  return path.join(root, `${baseName} restored ${index}${ext}`);
}

async function createUniqueRestorePath(fileName: string): Promise<string> {
  const workspaceRoot = getWorkspaceRoot();
  let index = 0;
  let candidate = assertInsideWorkspace(
    createRestoreCandidate(workspaceRoot, fileName, index),
    "Restore target",
  );

  while (await pathExists(candidate)) {
    index += 1;
    candidate = assertInsideWorkspace(
      createRestoreCandidate(workspaceRoot, fileName, index),
      "Restore target",
    );
  }

  return candidate;
}

async function restoreTrashEntry(payload: RestoreTrashPayload): Promise<string> {
  const trashRoot = getWorkspaceTrashRoot();
  const trashPath = await assertExistingPathInsideWorkspace(
    payload.trashPath,
    "Trash item",
  );

  if (!isInsideWorkspace(trashPath, trashRoot)) {
    throw new Error("Restore target is not inside Sandbox trash.");
  }

  if (normalizeForCompare(path.dirname(trashPath)) !== normalizeForCompare(trashRoot)) {
    throw new Error("Only direct Sandbox trash entries can be restored.");
  }

  const parsed = parseTrashName(path.basename(trashPath));
  const restoreName = payload.restoreName?.trim() || parsed.originalName;
  const restorePath = await createUniqueRestorePath(restoreName);

  await fs.rename(trashPath, restorePath);

  return restorePath;
}

async function buildFileTree(dirPath: string): Promise<FileNode[]> {
  const safeDirPath = assertInsideWorkspace(dirPath, "Folder path");
  const entries = await fs.readdir(safeDirPath, { withFileTypes: true });

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
      const entryPath = path.join(safeDirPath, entry.name);

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
  const normalizedPath = await assertExistingPathInsideWorkspace(
    payload.filePath,
    "Run target",
  );
  const ext = path.extname(normalizedPath).toLowerCase();

  if (!ALLOWED_RUN_EXTENSIONS.has(ext)) {
    throw new Error(`This file type cannot be run yet: ${ext}`);
  }

  const { command, args } = getRunCommand(normalizedPath);
  const cwd = payload.cwd
    ? assertInsideWorkspace(payload.cwd, "Run working directory")
    : path.dirname(normalizedPath);

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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
  const cwd = payload.cwd
    ? assertInsideWorkspace(payload.cwd, "Terminal working directory")
    : getWorkspaceRoot();
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

  const sendTerminalEvent = (
    channel: "terminal:data" | "terminal:exit",
    eventPayload: { terminalId: string; data: string } | { terminalId: string; exitCode: number },
  ) => {
    if (senderWindow.isDestroyed() || senderWindow.webContents.isDestroyed()) {
      terminals.delete(terminalId);
      ptyProcess.kill();
      return;
    }

    senderWindow.webContents.send(channel, eventPayload);
  };

  ptyProcess.onData((data) => {
    sendTerminalEvent("terminal:data", {
      terminalId,
      data,
    });
  });

  ptyProcess.onExit(({ exitCode }) => {
    sendTerminalEvent("terminal:exit", {
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
    minWidth: 760,
    minHeight: 620,
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

  win.on("closed", () => {
    killAllTerminals();
  });

  return win;
}

function normalizeAssistantMessage(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 12000) : "";
}

function normalizeAssistantFileContext(
  value: unknown,
): AssistantFileContext | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<AssistantFileContext>;
  if (typeof candidate.path !== "string" || typeof candidate.content !== "string") {
    return null;
  }

  return {
    path: assertInsideWorkspace(candidate.path, "Assistant file path"),
    content: candidate.content.slice(0, MAX_EDITOR_FILE_BYTES),
  };
}

function normalizeOpenFiles(value: unknown): AssistantOpenFile[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 20)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<AssistantOpenFile>;
      if (typeof candidate.path !== "string" || typeof candidate.name !== "string") {
        return [];
      }

      return [
        {
          path: assertInsideWorkspace(candidate.path, "Assistant open file path"),
          name: candidate.name.slice(0, 200),
        },
      ];
    });
}

function createAssistantPrompt(payload: AssistantRequestPayload): string {
  const workspaceRoot = getWorkspaceRoot();
  const currentFile = payload.currentFile;
  const openFiles = payload.openFiles ?? [];
  const terminalOutput = payload.terminalOutput?.slice(-6000) || "No terminal output provided.";

  return `You are SVANSAI Code Assistant inside Vansant Sandbox. You help review code, explain files, diagnose terminal output, and suggest edits. Be specific to the provided file/workspace context. Never answer as a generic topic classifier.

Sandbox context is code/workspace context, not general learning classification.
You are not a glossary, topic classifier, or keyword extractor.
Never answer with "Main Topic", "Related Concepts", labels, or extracted keywords unless the user explicitly asks for topic classification.
For review requests, give a concrete code/workspace review with findings, risks, and next steps.
If only the active file is available, say that clearly and review only that file.
If the user asks to review the main folder or project, use the workspace root, open file list, active file, and terminal context provided below. If the available context is not enough for a full review, state exactly which files or outputs are needed next.
Practical developer feedback should cover what the current file appears to do, possible issues, suggested improvements, and what additional files are needed for a fuller review.
For follow-up requests like "what can you do to change it?", refer to the previous/current workspace context and describe specific possible edits.
Do not claim files were changed. The Sandbox will apply edits only after the user approves them.
Preserve the approve-before-apply edit flow. Do not enable or imply automatic edits.
Keep command suggestions cautious and non-destructive.
Return a natural answer first. If edits are useful, include a JSON block with this exact shape:

\`\`\`json
{
  "suggestedEdits": [
    {
      "filePath": "absolute path inside the workspace",
      "originalText": "exact text currently in the file",
      "replacementText": "replacement text",
      "explanation": "why this edit helps"
    }
  ]
}
\`\`\`

Workspace:
${workspaceRoot}

Open files:
${openFiles.length > 0 ? openFiles.map((file) => `- ${file.name}: ${file.path}`).join("\n") : "None"}

Current file:
${currentFile ? currentFile.path : "None"}

Current file content:
\`\`\`
${currentFile ? currentFile.content : "No active text file."}
\`\`\`

Terminal context:
\`\`\`
${terminalOutput}
\`\`\`

Selected text:
Not provided by this Sandbox request.

User request:
${payload.message}`.trim();
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractSuggestedEdits(text: string): SuggestedEdit[] {
  const jsonBlocks = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  const objects = jsonBlocks
    .map((match) => tryParseJsonObject(match[1].trim()))
    .filter((item): item is Record<string, unknown> => Boolean(item));

  for (const object of objects) {
    const rawEdits = object.suggestedEdits;
    if (!Array.isArray(rawEdits)) continue;

    return rawEdits.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const edit = item as Partial<SuggestedEdit>;

      if (
        typeof edit.filePath !== "string" ||
        typeof edit.originalText !== "string" ||
        typeof edit.replacementText !== "string"
      ) {
        return [];
      }

      const filePath = assertInsideWorkspace(edit.filePath, "Suggested edit path");

      return [
        {
          id: `edit_${Date.now()}_${index}`,
          filePath,
          originalText: edit.originalText,
          replacementText: edit.replacementText,
          explanation:
            typeof edit.explanation === "string"
              ? edit.explanation
              : "SVANSAI suggested this code change.",
        },
      ];
    });
  }

  return [];
}

function stripSuggestedEditJson(text: string): string {
  return text
    .replace(/```(?:json)?\s*[\s\S]*?"suggestedEdits"[\s\S]*?```/gi, "")
    .trim();
}

function isTaxonomyOnlyResponse(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;

  const hasTaxonomyLabels =
    /\*\*Main Topic:\*\*/i.test(normalized) ||
    /\bMain Topic:\b/i.test(normalized) ||
    /\*\*Related Concepts:\*\*/i.test(normalized) ||
    /\bRelated Concepts:\b/i.test(normalized);
  const hasActionableReview =
    /\b(recommend|issue|risk|fix|change|edit|because|next step|suggest|file|line|folder|workspace)\b/i.test(
      normalized,
    );

  return hasTaxonomyLabels && !hasActionableReview;
}

function summarizeFileForReview(currentFile: AssistantFileContext): string {
  const fileName = path.basename(currentFile.path);
  const extension = path.extname(currentFile.path).toLowerCase() || "file";
  const lineCount = currentFile.content.split(/\r?\n/).length;
  const trimmedContent = currentFile.content.trim();
  const notes: string[] = [];

  if (!trimmedContent) {
    notes.push("The active file is empty.");
  }

  if (extension === ".json") {
    try {
      JSON.parse(currentFile.content);
      notes.push("The JSON parses correctly.");
    } catch (error) {
      notes.push(
        `The JSON has a parse problem: ${
          error instanceof Error ? error.message : "invalid JSON"
        }.`,
      );
    }

    if (/permissions|allow|deny/i.test(currentFile.content)) {
      notes.push(
        "This looks like a local permissions/settings file, so changes should be kept narrow and reviewed before broadening command access.",
      );
    }
  }

  return [
    `I can review the workspace context I have, starting with the active file: ${fileName}.`,
    "",
    `Quick read: ${fileName} is a ${extension} file with ${lineCount} lines.`,
    notes.length > 0 ? notes.map((note) => `- ${note}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function createLocalAssistantFallback(
  payload: AssistantRequestPayload,
): Promise<string> {
  const workspaceRoot = getWorkspaceRoot();
  const currentFile = payload.currentFile;
  const openFiles = payload.openFiles ?? [];
  const topLevelEntries = await fs
    .readdir(workspaceRoot, { withFileTypes: true })
    .then((entries) =>
      entries
        .filter((entry) => !HIDDEN_EXPLORER_ITEMS.has(entry.name))
        .slice(0, 12)
        .map((entry) => `${entry.isDirectory() ? "folder" : "file"}: ${entry.name}`),
    )
    .catch(() => []);

  const sections: string[] = [
    "I did not get a useful code-assistant answer back, so here is a practical review from the local Sandbox context instead.",
  ];

  if (currentFile) {
    sections.push(summarizeFileForReview(currentFile));
  } else {
    sections.push("No active text file is selected, so I cannot inspect file contents yet. I can still use the workspace folder list, open file names, and terminal output if they are available.");
  }

  if (openFiles.length > 0) {
    sections.push(
      [
        "Open files I can see:",
        ...openFiles.map((file) => `- ${file.name}`),
      ].join("\n"),
    );
  }

  if (topLevelEntries.length > 0) {
    sections.push(
      [
        "Top-level workspace items:",
        ...topLevelEntries.map((entry) => `- ${entry}`),
      ].join("\n"),
    );
  }

  sections.push(
    [
      "What I can do next:",
      "- Review the active file for mistakes or risky settings.",
      "- Explain terminal errors and connect them to the likely file.",
      "- Propose specific edits that you can approve before anything is changed.",
      "- Help inspect the main folder, but a full review needs the workspace file tree plus key files such as package/config files, entry points, and recent terminal output.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}

async function askSvansai(payload: AssistantRequestPayload): Promise<AssistantResponse> {
  const message = normalizeAssistantMessage(payload.message);

  if (!message) {
    throw new Error("Ask SVANSAI a question first.");
  }

  const requestPayload: AssistantRequestPayload = {
    message,
    currentFile: payload.currentFile
      ? normalizeAssistantFileContext(payload.currentFile)
      : null,
    openFiles: normalizeOpenFiles(payload.openFiles),
    terminalOutput:
      typeof payload.terminalOutput === "string"
        ? payload.terminalOutput.slice(-6000)
        : "",
  };
  const prompt = createAssistantPrompt(requestPayload);
  const apiUrl = getSvansaiApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, SVANSAI_ASSISTANT_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        config: {
          source: "vansant_sandbox",
          mode: "code_assistant",
        },
        knowledge: [],
        message: prompt,
        context: requestPayload,
      }),
    });

    if (!response.ok) {
      throw new Error(`SVANSAI API returned ${response.status}.`);
    }

    const data = (await response.json()) as {
      answer?: string;
      response?: string;
      message?: string;
      suggestedEdits?: unknown;
    };
    const rawAnswer =
      data.answer?.trim() || data.response?.trim() || data.message?.trim() || "";
      const suggestedEdits =
        Array.isArray(data.suggestedEdits) && rawAnswer
          ? extractSuggestedEdits(
              `\`\`\`json\n${JSON.stringify({ suggestedEdits: data.suggestedEdits })}\n\`\`\``,
            )
          : extractSuggestedEdits(rawAnswer);
      const cleanAnswer = stripSuggestedEditJson(rawAnswer);

      return {
        message: isTaxonomyOnlyResponse(cleanAnswer)
          ? await createLocalAssistantFallback(requestPayload)
          : cleanAnswer ||
            "I reviewed the provided context, but SVANSAI did not return a detailed answer.",
        suggestedEdits,
        provider: apiUrl,
      };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    const currentFile = requestPayload.currentFile;
    const fallback = currentFile
      ? `I could not reach SVANSAI right now, but I can see the active file is ${path.basename(
          currentFile.path,
        )}. Check the terminal output and the current file context, then ask again when the SVANSAI endpoint is reachable.`
      : "I could not reach SVANSAI right now. Open a file or provide terminal output, then try again when the SVANSAI endpoint is reachable.";

    return {
      message:
        isTimeout
          ? `${fallback}\n\nConnection detail: SVANSAI did not respond within ${Math.round(
              SVANSAI_ASSISTANT_TIMEOUT_MS / 1000,
            )} seconds.`
          : error instanceof Error
            ? `${fallback}\n\nConnection detail: ${error.message}`
            : fallback,
      suggestedEdits: [],
      provider: apiUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function applyAssistantEdits(payload: ApplyAssistantEditsPayload) {
  if (!Array.isArray(payload.edits) || payload.edits.length === 0) {
    throw new Error("No SVANSAI edits were provided.");
  }

  const results: Array<{ filePath: string; ok: boolean; message: string }> = [];

  for (const edit of payload.edits.slice(0, 20)) {
    const filePath = await assertExistingPathInsideWorkspace(
      edit.filePath,
      "Suggested edit path",
    );

    if (
      typeof edit.originalText !== "string" ||
      typeof edit.replacementText !== "string"
    ) {
      throw new Error(`Invalid edit for ${filePath}.`);
    }

    const content = await readTextFileForEditor(filePath);
    const index = content.indexOf(edit.originalText);

    if (index === -1) {
      results.push({
        filePath,
        ok: false,
        message: "Original text was not found. The file may have changed.",
      });
      continue;
    }

    const nextContent =
      content.slice(0, index) +
      edit.replacementText +
      content.slice(index + edit.originalText.length);

    await fs.writeFile(filePath, nextContent, "utf8");
    results.push({
      filePath,
      ok: true,
      message: "Applied.",
    });
  }

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

app.whenReady().then(() => {
  const mainWindow = createMainWindow();

  ipcMain.handle("shell:open-external-url", async (_event, rawUrl: string) => {
    await shell.openExternal(assertOpenableExternalUrl(rawUrl));

    return {
      ok: true,
    };
  });

  ipcMain.handle("workspace:open-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open Folder",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const folderPath = path.resolve(result.filePaths[0]);
    killAllTerminals();
    currentWorkspaceRoot = folderPath;
    const tree = await buildFileTree(folderPath);

    return {
      folderPath,
      tree,
    };
  });

  ipcMain.handle(
    "workspace:read-file",
    async (_event, filePath: string): Promise<ReadFileResult> => {
      const normalizedPath = await assertExistingPathInsideWorkspace(
        filePath,
        "File path",
      );
      const content = await readTextFileForEditor(normalizedPath);

      return {
        path: normalizedPath,
        content,
      };
    },
  );

  ipcMain.handle(
    "workspace:write-file",
    async (_event, payload: WriteFilePayload) => {
      const normalizedPath = assertInsideWorkspace(payload.path, "File path");
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

      const parentDir = await assertExistingPathInsideWorkspace(
        payload.parentDir,
        "Parent folder",
      );
      const targetPath = assertInsideWorkspace(
        path.join(parentDir, safeName),
        "New entry path",
      );

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
      const oldPath = await assertExistingPathInsideWorkspace(
        payload.oldPath,
        "Original path",
      );
      const newPath = assertInsideWorkspace(payload.newPath, "New path");

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
    const trashPath = await moveToWorkspaceTrash(targetPath);

    return {
      ok: true,
      trashPath,
    };
  });

  ipcMain.handle("workspace:list-trash", async () => {
    return listWorkspaceTrash();
  });

  ipcMain.handle(
    "workspace:restore-trash-entry",
    async (_event, payload: RestoreTrashPayload) => {
      const restoredPath = await restoreTrashEntry(payload);

      return {
        ok: true,
        path: restoredPath,
      };
    },
  );

  ipcMain.handle(
    "workspace:read-image",
    async (_event, filePath: string): Promise<ReadImageResult> => {
      const normalizedPath = await assertExistingPathInsideWorkspace(
        filePath,
        "Image path",
      );

      return readImageForPreview(normalizedPath);
    },
  );

  ipcMain.handle(
    "assistant:ask",
    async (_event, payload: AssistantRequestPayload) => {
      return askSvansai(payload);
    },
  );

  ipcMain.handle(
    "assistant:apply-edits",
    async (_event, payload: ApplyAssistantEditsPayload) => {
      return applyAssistantEdits(payload);
    },
  );

  ipcMain.handle("workspace:refresh-tree", async (_event, folderPath: string) => {
    const safeFolderPath = await assertExistingPathInsideWorkspace(
      folderPath,
      "Folder path",
    );
    const tree = await buildFileTree(safeFolderPath);

    return {
      folderPath: safeFolderPath,
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
  killAllTerminals();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
