import { useMemo, useState, useEffect } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import FileTree from "./components/FileTree";
import EditorTabs from "./components/EditorTabs";
import TerminalPanel from "./components/TerminalPanel";
import StatusBar from "./components/StatusBar";
import Commandbar from "./components/Commandbar";
import AIAssistantPanel from "./components/AIAssistantPanel";
import type {
  DiagnosticSummary,
  FileNode,
  GitStatus,
  OpenTab,
  RunResult,
  TrashEntry,
} from "./components/types";
import svansAiIcon from "./assets/sv-robot.png";

loader.config({ monaco });

const AUTO_OPEN_TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".ts",
  ".tsx",
  ".txt",
]);

const IMAGE_EXTENSIONS = new Set([
  ".apng",
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpe",
  ".jfif",
  ".jpeg",
  ".jpg",
  ".pjp",
  ".pjpeg",
  ".png",
  ".svg",
  ".webp",
]);

type QuickOpenFile = {
  name: string;
  path: string;
  relativePath: string;
};

type DraftRecord = {
  content: string;
  savedAt: number;
};

const DRAFT_PREFIX = "vansant-sandbox:draft:v1:";
const DEFAULT_EDITOR_FONT_SIZE = 14;
const MIN_EDITOR_FONT_SIZE = 10;
const MAX_EDITOR_FONT_SIZE = 28;
const DEFAULT_IMAGE_ZOOM = 100;
const MIN_IMAGE_ZOOM = 10;
const MAX_IMAGE_ZOOM = 500;

function getFileExtension(filePath: string): string {
  const name = basename(filePath);
  const dotIndex = name.lastIndexOf(".");

  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function shouldAutoOpenFile(filePath: string): boolean {
  return AUTO_OPEN_TEXT_EXTENSIONS.has(getFileExtension(filePath));
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filePath));
}

function makeRelativePath(filePath: string, workspacePath: string | null): string {
  const normalizedFile = normalizePath(filePath);
  const normalizedWorkspace = workspacePath ? normalizePath(workspacePath) : "";

  if (normalizedWorkspace && normalizedFile.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedFile.slice(normalizedWorkspace.length + 1);
  }

  return normalizedFile;
}

function collectQuickOpenFiles(
  nodes: FileNode[],
  workspacePath: string | null,
): QuickOpenFile[] {
  const files: QuickOpenFile[] = [];

  for (const node of nodes) {
    if (
      node.type === "file" &&
      (shouldAutoOpenFile(node.path) || isImageFile(node.path))
    ) {
      files.push({
        name: node.name,
        path: node.path,
        relativePath: makeRelativePath(node.path, workspacePath),
      });
    }

    if (node.children?.length) {
      files.push(...collectQuickOpenFiles(node.children, workspacePath));
    }
  }

  return files;
}

function flattenFirstEditableFile(nodes: FileNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "file" && shouldAutoOpenFile(node.path)) return node.path;

    if (node.children?.length) {
      const found = flattenFirstEditableFile(node.children);
      if (found) return found;
    }
  }

  return null;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || filePath;
}

function getLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();

  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return "javascript";
  }

  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".java")) return "java";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html")) return "html";

  return "plaintext";
}

function buildSiblingPath(targetPath: string, nextName: string): string {
  const normalized = targetPath.replace(/\\/g, "/");
  const parent = normalized.slice(0, normalized.lastIndexOf("/"));

  if (!parent) return nextName;

  return `${parent}/${nextName}`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isPathAtOrInside(candidatePath: string, targetPath: string): boolean {
  const candidate = normalizePath(candidatePath);
  const target = normalizePath(targetPath);

  return candidate === target || candidate.startsWith(`${target}/`);
}

function getDraftKey(workspacePath: string | null, filePath: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(
    `${normalizePath(workspacePath ?? "no-workspace")}::${normalizePath(filePath)}`,
  )}`;
}

function readDraft(
  workspacePath: string | null,
  filePath: string,
): DraftRecord | null {
  try {
    const raw = window.localStorage.getItem(getDraftKey(workspacePath, filePath));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DraftRecord>;

    if (typeof parsed.content !== "string" || typeof parsed.savedAt !== "number") {
      return null;
    }

    return {
      content: parsed.content,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

function writeDraft(
  workspacePath: string | null,
  filePath: string,
  content: string,
): void {
  try {
    window.localStorage.setItem(
      getDraftKey(workspacePath, filePath),
      JSON.stringify({
        content,
        savedAt: Date.now(),
      } satisfies DraftRecord),
    );
  } catch {
    // Draft recovery is best-effort and should never block editing.
  }
}

function removeDraft(workspacePath: string | null, filePath: string): void {
  try {
    window.localStorage.removeItem(getDraftKey(workspacePath, filePath));
  } catch {
    // Best effort cleanup.
  }
}

function removeDraftsForPath(
  workspacePath: string | null,
  targetPath: string,
  tabs: OpenTab[],
): void {
  for (const tab of tabs) {
    if (isPathAtOrInside(tab.path, targetPath)) {
      removeDraft(workspacePath, tab.path);
    }
  }
}

function moveDraft(
  workspacePath: string | null,
  oldPath: string,
  newPath: string,
): void {
  const draft = readDraft(workspacePath, oldPath);

  if (!draft) return;

  writeDraft(workspacePath, newPath, draft.content);
  removeDraft(workspacePath, oldPath);
}

function clampEditorFontSize(fontSize: number): number {
  return Math.max(
    MIN_EDITOR_FONT_SIZE,
    Math.min(MAX_EDITOR_FONT_SIZE, fontSize),
  );
}

function clampImageZoom(zoom: number): number {
  return Math.max(MIN_IMAGE_ZOOM, Math.min(MAX_IMAGE_ZOOM, zoom));
}

export default function App() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(260);
  const [isResizingTerminal, setIsResizingTerminal] = useState(false);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const [editorFontSize, setEditorFontSize] = useState(DEFAULT_EDITOR_FONT_SIZE);
  const [imageZoom, setImageZoom] = useState(DEFAULT_IMAGE_ZOOM);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [diagnosticsByPath, setDiagnosticsByPath] = useState<
    Record<string, DiagnosticSummary>
  >({});

  useEffect(() => {
    if (!isResizingTerminal) return;

    const handleMouseMove = (event: MouseEvent) => {
      const nextHeight = window.innerHeight - event.clientY - 32;
      const clampedHeight = Math.max(140, Math.min(600, nextHeight));
      setTerminalHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizingTerminal(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingTerminal]);

  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.path === activePath) ?? null,
    [openTabs, activePath],
  );

  const dirtyTabs = useMemo(
    () => openTabs.filter((tab) => tab.isDirty),
    [openTabs],
  );

  const hasUnsavedChanges = dirtyTabs.length > 0;

  const quickOpenFiles = useMemo(
    () => collectQuickOpenFiles(tree, workspacePath),
    [tree, workspacePath],
  );

  const filteredQuickOpenFiles = useMemo(() => {
    const query = quickOpenQuery.trim().toLowerCase();
    const files = query
      ? quickOpenFiles.filter((file) =>
          file.relativePath.toLowerCase().includes(query),
        )
      : quickOpenFiles;

    return files.slice(0, 30);
  }, [quickOpenFiles, quickOpenQuery]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeClose);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeClose);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    for (const tab of openTabs) {
      if (tab.kind === "text" && tab.isDirty) {
        writeDraft(workspacePath, tab.path, tab.content);
      }
    }
  }, [openTabs, workspacePath]);

  useEffect(() => {
    const handleQuickOpenShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "p") {
        return;
      }

      event.preventDefault();

      if (!workspacePath) {
        setStatusMessage("Open a workspace before using quick open.");
        return;
      }

      setQuickOpenQuery("");
      setQuickOpenIndex(0);
      setQuickOpenVisible(true);
    };

    window.addEventListener("keydown", handleQuickOpenShortcut);

    return () => {
      window.removeEventListener("keydown", handleQuickOpenShortcut);
    };
  }, [workspacePath]);

  useEffect(() => {
    const handleEditorShortcuts = (event: KeyboardEvent) => {
      const usesCommandKey = event.ctrlKey || event.metaKey;

      if (!usesCommandKey) return;

      const key = event.key.toLowerCase();

      if (
        event.key === "=" ||
        event.key === "+" ||
        event.code === "Equal" ||
        event.code === "NumpadAdd"
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (activeTab?.kind === "image") {
          zoomImageIn();
        } else {
          zoomEditorIn();
        }
        return;
      }

      if (event.key === "-" || event.code === "Minus" || event.code === "NumpadSubtract") {
        event.preventDefault();
        event.stopPropagation();
        if (activeTab?.kind === "image") {
          zoomImageOut();
        } else {
          zoomEditorOut();
        }
        return;
      }

      if (event.key === "0" || event.code === "Digit0" || event.code === "Numpad0") {
        event.preventDefault();
        event.stopPropagation();
        if (activeTab?.kind === "image") {
          resetImageZoom();
        } else {
          resetEditorZoom();
        }
        return;
      }

      if (event.shiftKey && key === "s") {
        event.preventDefault();
        void saveAllFiles();
        return;
      }

      if (key === "s") {
        event.preventDefault();
        void saveActiveFile();
        return;
      }

      if (event.key === "Enter" && !quickOpenVisible) {
        event.preventDefault();
        void runActiveFile();
      }
    };

    window.addEventListener("keydown", handleEditorShortcuts, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleEditorShortcuts, { capture: true });
    };
  }, [activeTab, dirtyTabs, quickOpenVisible, running, workspacePath]);

  useEffect(() => {
    const handleZoomWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.deltaY < 0) {
        if (activeTab?.kind === "image") {
          zoomImageIn();
        } else {
          zoomEditorIn();
        }
      } else if (event.deltaY > 0) {
        if (activeTab?.kind === "image") {
          zoomImageOut();
        } else {
          zoomEditorOut();
        }
      }
    };

    window.addEventListener("wheel", handleZoomWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      window.removeEventListener("wheel", handleZoomWheel, { capture: true });
    };
  }, [activeTab]);

  function zoomEditorIn() {
    setEditorFontSize((current) => clampEditorFontSize(current + 1));
  }

  function zoomEditorOut() {
    setEditorFontSize((current) => clampEditorFontSize(current - 1));
  }

  function resetEditorZoom() {
    setEditorFontSize(DEFAULT_EDITOR_FONT_SIZE);
  }

  function zoomImageIn() {
    setImageZoom((current) => clampImageZoom(current + 10));
  }

  function zoomImageOut() {
    setImageZoom((current) => clampImageZoom(current - 10));
  }

  function resetImageZoom() {
    setImageZoom(DEFAULT_IMAGE_ZOOM);
  }

  function updateDiagnosticsForPath(
    filePath: string,
    markers: monaco.editor.IMarker[],
  ) {
    const errors = markers.filter(
      (marker) => marker.severity === monaco.MarkerSeverity.Error,
    ).length;
    const warnings = markers.filter(
      (marker) => marker.severity === monaco.MarkerSeverity.Warning,
    ).length;

    setDiagnosticsByPath((current) => {
      const next = { ...current };

      if (errors === 0 && warnings === 0) {
        delete next[filePath];
      } else {
        next[filePath] = { errors, warnings };
      }

      return next;
    });
  }

  async function refreshTree(folderPath: string) {
    const result = await window.sandboxApi.refreshTree(folderPath);
    setTree(result.tree);
  }

  async function refreshGitStatus(folderPath: string) {
    const result = await window.sandboxApi.getGitStatus(folderPath);
    setGitStatus(result);
  }

  async function refreshTrash() {
    if (!workspacePath) {
      setTrashEntries([]);
      return;
    }

    const result = await window.sandboxApi.listTrash();
    setTrashEntries(result);
  }

  useEffect(() => {
    if (!workspacePath) {
      setGitStatus(null);
      return;
    }

    let canceled = false;

    async function refreshWorkspaceState() {
      if (!workspacePath) return;

      try {
        const [treeResult, gitResult] = await Promise.all([
          window.sandboxApi.refreshTree(workspacePath),
          window.sandboxApi.getGitStatus(workspacePath),
        ]);

        if (canceled) return;

        setTree(treeResult.tree);
        setGitStatus(gitResult);
      } catch {
        if (!canceled) {
          setGitStatus(null);
        }
      }
    }

    void refreshWorkspaceState();
    const intervalId = window.setInterval(refreshWorkspaceState, 5000);

    return () => {
      canceled = true;
      window.clearInterval(intervalId);
    };
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath) return;

    let refreshTimer: number | null = null;
    const removeListener = window.sandboxApi.onWorkspaceChanged((payload) => {
      if (normalizePath(payload.folderPath) !== normalizePath(workspacePath)) return;

      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshTree(workspacePath);
        void refreshTrash();
        void refreshGitStatus(workspacePath);
        setStatusMessage(`Workspace updated: ${basename(payload.changedPath)}`);
      }, 150);
    });

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      removeListener();
    };
  }, [workspacePath]);

  function confirmDiscardUnsaved(action: string, tabs = dirtyTabs): boolean {
    if (tabs.length === 0) return true;

    const fileList = tabs.map((tab) => `- ${tab.name}`).join("\n");

    return window.confirm(
      `You have unsaved changes:\n\n${fileList}\n\n${action}`,
    );
  }

  async function openWorkspace() {
    if (dirtyTabs.length > 0) {
      const currentWorkspacePath = workspacePath;
      const currentDirtyTabs = dirtyTabs;

      if (
        !confirmDiscardUnsaved(
          "Open a different workspace and discard these unsaved editor changes?",
          currentDirtyTabs,
        )
      ) {
        return;
      }

      for (const tab of currentDirtyTabs) {
        removeDraft(currentWorkspacePath, tab.path);
      }
    }

    try {
      setBusy(true);

      const result = await window.sandboxApi.openFolder();

      if (!result) {
        setStatusMessage("Open folder canceled.");
        return;
      }

      setWorkspacePath(result.folderPath);
      setTree(result.tree);
      setDiagnosticsByPath({});
      setTrashEntries(await window.sandboxApi.listTrash());
      setGitStatus(await window.sandboxApi.getGitStatus(result.folderPath));
      setStatusMessage(`Opened workspace: ${result.folderPath}`);

      const firstFile = flattenFirstEditableFile(result.tree);
      if (firstFile) {
        await openFile(firstFile);
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to open folder.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openFile(filePath: string) {
    try {
      const existing = openTabs.find((tab) => tab.path === filePath);

      if (existing) {
        setActivePath(filePath);
        return;
      }

      if (isImageFile(filePath)) {
        const image = await window.sandboxApi.readImage(filePath);

        const tab: OpenTab = {
          path: image.path,
          name: basename(image.path),
          content: "",
          kind: "image",
          imageSrc: image.dataUrl,
          mimeType: image.mimeType,
          isDirty: false,
        };

        setOpenTabs((prev) => [...prev, tab]);
        setActivePath(image.path);
        setStatusMessage(`Opened image: ${image.path}`);
        return;
      }

      const result = await window.sandboxApi.readFile(filePath);
      const draft = readDraft(workspacePath, result.path);
      const shouldRestoreDraft = Boolean(
        draft &&
        draft.content !== result.content &&
        window.confirm(
          `Recovered unsaved draft for "${basename(
            result.path,
          )}" from ${new Date(draft.savedAt).toLocaleString()}.\n\nRestore it?`,
        ),
      );

      if (draft && !shouldRestoreDraft) {
        removeDraft(workspacePath, result.path);
      }

      const tab: OpenTab = {
        path: result.path,
        name: basename(result.path),
        content: shouldRestoreDraft && draft ? draft.content : result.content,
        kind: "text",
        isDirty: shouldRestoreDraft,
      };

      setOpenTabs((prev) => [...prev, tab]);
      setActivePath(result.path);
      setStatusMessage(`Opened file: ${result.path}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to open file.",
      );
    }
  }

  function updateActiveContent(nextContent: string | undefined) {
    if (!activePath || typeof nextContent !== "string") return;

    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.path === activePath && tab.kind === "text"
          ? {
              ...tab,
              content: nextContent,
              isDirty: true,
            }
          : tab,
      ),
    );
  }

  async function saveActiveFile(): Promise<boolean> {
    if (!activeTab || activeTab.kind !== "text") {
      setStatusMessage("No active file to save.");
      return false;
    }

    try {
      await window.sandboxApi.writeFile(activeTab.path, activeTab.content);
      removeDraft(workspacePath, activeTab.path);

      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.path === activeTab.path ? { ...tab, isDirty: false } : tab,
        ),
      );

      setStatusMessage(`Saved file: ${activeTab.path}`);

      if (workspacePath) {
        await refreshTree(workspacePath);
      }

      return true;
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to save file.",
      );

      return false;
    }
  }

  async function saveAllFiles(): Promise<boolean> {
    const dirtyTextTabs = dirtyTabs.filter((tab) => tab.kind === "text");

    if (dirtyTextTabs.length === 0) {
      setStatusMessage("No unsaved files to save.");
      return true;
    }

    try {
      await Promise.all(
        dirtyTextTabs.map((tab) =>
          window.sandboxApi.writeFile(tab.path, tab.content),
        ),
      );

      const savedPaths = new Set(dirtyTextTabs.map((tab) => tab.path));

      for (const tab of dirtyTextTabs) {
        removeDraft(workspacePath, tab.path);
      }

      setOpenTabs((prev) =>
        prev.map((tab) =>
          savedPaths.has(tab.path) ? { ...tab, isDirty: false } : tab,
        ),
      );

      setStatusMessage(`Saved ${dirtyTextTabs.length} file${dirtyTextTabs.length === 1 ? "" : "s"}.`);

      if (workspacePath) {
        await refreshTree(workspacePath);
      }

      return true;
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to save all files.",
      );

      return false;
    }
  }

  async function openQuickFile(filePath: string) {
    setQuickOpenVisible(false);
    setQuickOpenQuery("");
    setQuickOpenIndex(0);
    await openFile(filePath);
  }

  async function createEntry(
    type: "file" | "directory",
    parentOverride?: string | null,
  ) {
    if (!workspacePath) {
      setStatusMessage("Open a workspace first.");
      return;
    }

    const label = type === "file" ? "file" : "folder";
    const name = window.prompt(`Enter ${label} name:`);

    if (!name?.trim()) return;

    const parentDir = parentOverride ?? workspacePath;

    try {
      await window.sandboxApi.createEntry(parentDir, name.trim(), type);
      await refreshTree(workspacePath);
      setStatusMessage(`Created ${label}: ${name.trim()}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : `Failed to create ${label}.`,
      );
    }
  }

  async function renameEntry(node: FileNode) {
    if (!workspacePath) return;

    const dirtyMatches = dirtyTabs.filter((tab) =>
      isPathAtOrInside(tab.path, node.path),
    );

    if (
      dirtyMatches.length > 0 &&
      !confirmDiscardUnsaved(
        "Rename anyway? Unsaved edits will stay open in the editor and can be saved after the rename.",
        dirtyMatches,
      )
    ) {
      return;
    }

    const nextName = window.prompt("Enter new name:", node.name);

    if (!nextName?.trim() || nextName.trim() === node.name) return;

    try {
      const nextPath = buildSiblingPath(node.path, nextName.trim());

      await window.sandboxApi.renameEntry(node.path, nextPath);
      await refreshTree(workspacePath);
      moveDraft(workspacePath, node.path, nextPath);

      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.path === node.path
            ? {
                ...tab,
                path: nextPath,
                name: basename(nextPath),
              }
            : tab,
        ),
      );

      if (activePath === node.path) {
        setActivePath(nextPath);
      }

      setStatusMessage(`Renamed: ${node.name} → ${nextName.trim()}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to rename item.",
      );
    }
  }

  async function deleteEntry(node: FileNode) {
    if (!workspacePath) return;

    const dirtyMatches = dirtyTabs.filter((tab) =>
      isPathAtOrInside(tab.path, node.path),
    );

    if (
      dirtyMatches.length > 0 &&
      !confirmDiscardUnsaved(
        `Move this ${node.type === "directory" ? "folder" : "file"} to trash and discard these unsaved editor changes?`,
        dirtyMatches,
      )
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Move ${node.type === "directory" ? "folder" : "file"} "${node.name}" to Sandbox trash?`,
    );

    if (!confirmed) return;

    try {
      const result = await window.sandboxApi.deleteEntry(node.path);
      await refreshTree(workspacePath);
      await refreshTrash();
      removeDraftsForPath(workspacePath, node.path, openTabs);

      setOpenTabs((prev) =>
        prev.filter(
          (tab) => !isPathAtOrInside(tab.path, node.path),
        ),
      );

      if (activePath && isPathAtOrInside(activePath, node.path)) {
        setActivePath(null);
      }

      setStatusMessage(`Moved to trash: ${node.name} (${result.trashPath})`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to delete item.",
      );
    }
  }

  function closeTab(filePath: string) {
    const tab = openTabs.find((item) => item.path === filePath);

    if (
      tab?.isDirty &&
      !confirmDiscardUnsaved(`Close "${tab.name}" without saving?`, [tab])
    ) {
      return;
    }

    if (tab?.isDirty) {
      removeDraft(workspacePath, tab.path);
    }

    setOpenTabs((prev) => prev.filter((tab) => tab.path !== filePath));

    if (activePath === filePath) {
      const remaining = openTabs.filter((tab) => tab.path !== filePath);
      setActivePath(
        remaining.length > 0 ? remaining[remaining.length - 1].path : null,
      );
    }
  }

  async function runActiveFile() {
    if (!activeTab) {
      setStatusMessage("Open a file before running.");
      return;
    }

    if (activeTab.kind !== "text") {
      setStatusMessage("Image previews cannot be run.");
      return;
    }

    if (activeTab.isDirty) {
      const shouldSave = window.confirm(
        `"${activeTab.name}" has unsaved changes. Save before running it?`,
      );

      if (!shouldSave) {
        setStatusMessage("Run canceled. Save the file or run after discarding changes.");
        return;
      }

      const saved = await saveActiveFile();

      if (!saved) return;
    }

    try {
      setRunning(true);
      setStatusMessage(`Running ${activeTab.name}...`);

      const result = await window.sandboxApi.runFile(
        activeTab.path,
        workspacePath ?? undefined,
      );

      setRunResult(result);

      if (workspacePath) {
        await refreshTree(workspacePath);
        await refreshGitStatus(workspacePath);
      }

      setStatusMessage(
        result.ok
          ? `Run complete: ${activeTab.name}`
          : `Run finished with errors: ${activeTab.name}`,
      );
    } catch (error) {
      setRunResult(null);
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to run file.",
      );
    } finally {
      setRunning(false);
    }
  }

  async function restoreTrashEntry(entry: TrashEntry) {
    if (!workspacePath) return;

    const confirmed = window.confirm(
      `Restore "${entry.originalName}" to the workspace root?`,
    );

    if (!confirmed) return;

    try {
      const result = await window.sandboxApi.restoreTrashEntry(
        entry.path,
        entry.originalName,
      );

      await refreshTree(workspacePath);
      await refreshTrash();
      setStatusMessage(`Restored: ${result.path}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to restore item.",
      );
    }
  }

  async function handleAssistantEditsApplied(filePaths: string[]) {
    if (workspacePath) {
      await refreshTree(workspacePath);
    }

    for (const filePath of filePaths) {
      const openTab = openTabs.find((tab) => tab.path === filePath);
      if (!openTab || openTab.kind !== "text") continue;

      try {
        const result = await window.sandboxApi.readFile(filePath);
        removeDraft(workspacePath, filePath);
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.path === filePath && tab.kind === "text"
              ? {
                  ...tab,
                  content: result.content,
                  isDirty: false,
                }
              : tab,
          ),
        );
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Applied edit, but failed to refresh the open tab.",
        );
      }
    }
  }

  return (
    <div className="app-shell">
      <Commandbar
        open={quickOpenVisible}
        query={quickOpenQuery}
        files={filteredQuickOpenFiles}
        selectedIndex={Math.min(
          quickOpenIndex,
          Math.max(filteredQuickOpenFiles.length - 1, 0),
        )}
        onQueryChange={(query) => {
          setQuickOpenQuery(query);
          setQuickOpenIndex(0);
        }}
        onSelectIndex={setQuickOpenIndex}
        onOpenFile={(filePath) => void openQuickFile(filePath)}
        onClose={() => setQuickOpenVisible(false)}
      />

      <header className="topbar">
        <div>
          <div className="eyebrow">Vansant Sandbox</div>
          <h1>Web-scale editor, desktop-grade workspace</h1>
        </div>

        <div className="toolbar">
          <button
            className="primary-btn"
            onClick={openWorkspace}
            disabled={busy}
          >
            {busy ? "Opening..." : "Open Folder"}
          </button>

          <button
            className="secondary-btn"
            onClick={() => createEntry("file")}
            disabled={!workspacePath}
          >
            New File
          </button>

          <button
            className="secondary-btn"
            onClick={() => createEntry("directory")}
            disabled={!workspacePath}
          >
            New Folder
          </button>

          <button
            className="secondary-btn"
            onClick={() => {
              setQuickOpenQuery("");
              setQuickOpenIndex(0);
              setQuickOpenVisible(true);
            }}
            disabled={!workspacePath}
            title="Quick open files"
          >
            Quick Open
          </button>

          <button
            className="secondary-btn"
            onClick={saveActiveFile}
            disabled={!activeTab || activeTab.kind !== "text"}
            title="Save active file (Ctrl+S)"
          >
            Save
          </button>

          <button
            className="secondary-btn"
            onClick={saveAllFiles}
            disabled={dirtyTabs.length === 0}
            title="Save all modified files (Ctrl+Shift+S)"
          >
            Save All
          </button>

          <div className="zoom-controls" aria-label="Editor zoom controls">
            <button
              className="secondary-btn zoom-btn"
              onClick={zoomEditorOut}
              disabled={editorFontSize <= MIN_EDITOR_FONT_SIZE}
              title="Zoom out (Ctrl+-)"
            >
              -
            </button>

            <button
              className="secondary-btn zoom-label-btn"
              onClick={resetEditorZoom}
              title="Reset zoom (Ctrl+0)"
            >
              {editorFontSize}px
            </button>

            <button
              className="secondary-btn zoom-btn"
              onClick={zoomEditorIn}
              disabled={editorFontSize >= MAX_EDITOR_FONT_SIZE}
              title="Zoom in (Ctrl+=)"
            >
              +
            </button>
          </div>

          <button
            className="accent-btn"
            onClick={runActiveFile}
            disabled={!activeTab || activeTab.kind !== "text" || running}
            title="Run active file (Ctrl+Enter)"
          >
            {running ? "Running..." : "Run File"}
          </button>

          <button
            className={`assistant-toggle-btn${assistantOpen ? " assistant-toggle-btn-active" : ""}`}
            onClick={() => setAssistantOpen((open) => !open)}
            disabled={!workspacePath}
            title="Open SVANSAI Code Assistant"
            aria-pressed={assistantOpen}
            aria-label="Toggle SVANSAI Code Assistant"
          >
            <img src={svansAiIcon} alt="" className="assistant-toggle-icon" />
          </button>
        </div>
      </header>

      <div className={`workspace-grid${assistantOpen ? " workspace-grid-assistant-open" : ""}`}>
        <aside className="sidebar-panel">
          <div className="panel-title-row">
            <h3>Explorer</h3>
            <span className="status-pill">
              {workspacePath ? "Open" : "Closed"}
            </span>
          </div>

          <div className="workspace-path" title={workspacePath ?? ""}>
            {workspacePath ?? "No folder opened yet."}
          </div>

          <FileTree
            nodes={tree}
            activePath={activePath}
            diagnosticsByPath={diagnosticsByPath}
            onOpenFile={openFile}
            onCreateEntry={(parentDir, type) => createEntry(type, parentDir)}
            onRenameEntry={renameEntry}
            onDeleteEntry={deleteEntry}
          />

          <div className="trash-panel">
            <div className="trash-panel-header">
              <span>Trash</span>
              <button
                type="button"
                className="trash-refresh-btn"
                onClick={refreshTrash}
                disabled={!workspacePath}
              >
                Refresh
              </button>
            </div>

            {trashEntries.length === 0 ? (
              <div className="trash-empty">No deleted items.</div>
            ) : (
              <div className="trash-list">
                {trashEntries.map((entry) => (
                  <div key={entry.path} className="trash-item">
                    <div className="trash-item-details" title={entry.name}>
                      <span className="trash-item-name">
                        {entry.type === "directory" ? "Folder" : "File"}:{" "}
                        {entry.originalName}
                      </span>
                      <span className="trash-item-date">
                        {entry.deletedAt
                          ? new Date(entry.deletedAt).toLocaleString()
                          : "Recently deleted"}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="trash-restore-btn"
                      onClick={() => restoreTrashEntry(entry)}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="editor-panel">
          <EditorTabs
            tabs={openTabs}
            activePath={activePath}
            onSelect={setActivePath}
            onClose={closeTab}
          />

          <div className="editor-wrapper">
            {activeTab?.kind === "image" ? (
              <div className="image-preview">
                <div className="image-preview-toolbar">
                  <div className="image-preview-title">
                    <span>{activeTab.name}</span>
                    <span>{activeTab.mimeType}</span>
                  </div>

                  <div className="zoom-controls" aria-label="Image zoom controls">
                    <button
                      className="secondary-btn zoom-btn"
                      onClick={zoomImageOut}
                      disabled={imageZoom <= MIN_IMAGE_ZOOM}
                      title="Zoom image out (Ctrl+-)"
                    >
                      -
                    </button>

                    <button
                      className="secondary-btn zoom-label-btn"
                      onClick={resetImageZoom}
                      title="Reset image zoom (Ctrl+0)"
                    >
                      {imageZoom}%
                    </button>

                    <button
                      className="secondary-btn zoom-btn"
                      onClick={zoomImageIn}
                      disabled={imageZoom >= MAX_IMAGE_ZOOM}
                      title="Zoom image in (Ctrl+=)"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="image-preview-stage">
                  <img
                    src={activeTab.imageSrc}
                    alt={activeTab.name}
                    className="image-preview-img"
                    style={{
                      maxWidth: "none",
                      maxHeight: "none",
                      width: `${imageZoom}%`,
                      height: "auto",
                    }}
                  />
                </div>
                <div className="image-preview-meta">
                  <span>{activeTab.name}</span>
                  <span>{activeTab.mimeType}</span>
                </div>
              </div>
            ) : activeTab ? (
              <Editor
                height="100%"
                theme="vs-dark"
                path={activeTab.path}
                defaultLanguage={getLanguage(activeTab.path)}
                language={getLanguage(activeTab.path)}
                value={activeTab.content}
                onChange={updateActiveContent}
                onValidate={(markers) =>
                  updateDiagnosticsForPath(activeTab.path, markers)
                }
                options={{
                  minimap: { enabled: true },
                  fontSize: editorFontSize,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: "on",
                  smoothScrolling: true,
                }}
              />
            ) : (
              <div className="editor-empty-state">
                <h2>Open a folder to begin</h2>
                <p>
                  Use the explorer to open files, edit code, and run Python,
                  JavaScript, TypeScript, or Java files.
                </p>

                <button className="primary-btn" onClick={openWorkspace}>
                  Open Workspace
                </button>
              </div>
            )}
          </div>
        </section>

        {assistantOpen && (
          <AIAssistantPanel
            activeTab={activeTab}
            openTabs={openTabs}
            runResult={runResult}
            workspacePath={workspacePath}
            onEditsApplied={handleAssistantEditsApplied}
            onStatus={setStatusMessage}
          />
        )}
      </div>

      <div
        className="terminal-resize-handle"
        onMouseDown={() => setIsResizingTerminal(true)}
      />

      <TerminalPanel
        result={runResult}
        statusMessage={statusMessage}
        loading={running}
        workspacePath={workspacePath}
        height={terminalHeight}
      />

      <StatusBar
        workspacePath={workspacePath}
        activeFilePath={activePath}
        statusMessage={statusMessage}
        gitStatus={gitStatus}
      />
    </div>
  );
}
