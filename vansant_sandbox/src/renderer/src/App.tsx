import { useMemo, useState, useEffect } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import FileTree from "./components/FileTree";
import EditorTabs from "./components/EditorTabs";
import TerminalPanel from "./components/TerminalPanel";
import StatusBar from "./components/StatusBar";
import type { FileNode, OpenTab, RunResult } from "./components/types";

loader.config({ monaco });

function flattenFirstFile(nodes: FileNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "file") return node.path;

    if (node.children?.length) {
      const found = flattenFirstFile(node.children);
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

export default function App() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(260);
  const [isResizingTerminal, setIsResizingTerminal] = useState(false);

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

  async function refreshTree(folderPath: string) {
    const result = await window.sandboxApi.refreshTree(folderPath);
    setTree(result.tree);
  }

  async function openWorkspace() {
    try {
      setBusy(true);

      const result = await window.sandboxApi.openFolder();

      if (!result) {
        setStatusMessage("Open folder canceled.");
        return;
      }

      setWorkspacePath(result.folderPath);
      setTree(result.tree);
      setStatusMessage(`Opened workspace: ${result.folderPath}`);

      const firstFile = flattenFirstFile(result.tree);
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

      const result = await window.sandboxApi.readFile(filePath);

      const tab: OpenTab = {
        path: result.path,
        name: basename(result.path),
        content: result.content,
        isDirty: false,
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
        tab.path === activePath
          ? {
              ...tab,
              content: nextContent,
              isDirty: true,
            }
          : tab,
      ),
    );
  }

  async function saveActiveFile() {
    if (!activeTab) {
      setStatusMessage("No active file to save.");
      return;
    }

    try {
      await window.sandboxApi.writeFile(activeTab.path, activeTab.content);

      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.path === activeTab.path ? { ...tab, isDirty: false } : tab,
        ),
      );

      setStatusMessage(`Saved file: ${activeTab.path}`);

      if (workspacePath) {
        await refreshTree(workspacePath);
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to save file.",
      );
    }
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

    const nextName = window.prompt("Enter new name:", node.name);

    if (!nextName?.trim() || nextName.trim() === node.name) return;

    try {
      const nextPath = buildSiblingPath(node.path, nextName.trim());

      await window.sandboxApi.renameEntry(node.path, nextPath);
      await refreshTree(workspacePath);

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

    const confirmed = window.confirm(
      `Delete ${node.type === "directory" ? "folder" : "file"} "${node.name}"?`,
    );

    if (!confirmed) return;

    try {
      await window.sandboxApi.deleteEntry(node.path);
      await refreshTree(workspacePath);

      setOpenTabs((prev) =>
        prev.filter(
          (tab) =>
            tab.path !== node.path && !tab.path.startsWith(`${node.path}/`),
        ),
      );

      if (activePath === node.path || activePath?.startsWith(`${node.path}/`)) {
        setActivePath(null);
      }

      setStatusMessage(`Deleted: ${node.name}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to delete item.",
      );
    }
  }

  function closeTab(filePath: string) {
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

    try {
      setRunning(true);
      setStatusMessage(`Running ${activeTab.name}...`);

      const result = await window.sandboxApi.runFile(
        activeTab.path,
        workspacePath ?? undefined,
      );

      setRunResult(result);

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

  return (
    <div className="app-shell">
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
            onClick={saveActiveFile}
            disabled={!activeTab}
          >
            Save
          </button>

          <button
            className="accent-btn"
            onClick={runActiveFile}
            disabled={!activeTab || running}
          >
            {running ? "Running..." : "Run File"}
          </button>
        </div>
      </header>

      <div className="workspace-grid">
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
            onOpenFile={openFile}
            onCreateEntry={(parentDir, type) => createEntry(type, parentDir)}
            onRenameEntry={renameEntry}
            onDeleteEntry={deleteEntry}
          />
        </aside>

        <section className="editor-panel">
          <EditorTabs
            tabs={openTabs}
            activePath={activePath}
            onSelect={setActivePath}
            onClose={closeTab}
          />

          <div className="editor-wrapper">
            {activeTab ? (
              <Editor
                height="100%"
                theme="vs-dark"
                path={activeTab.path}
                defaultLanguage={getLanguage(activeTab.path)}
                language={getLanguage(activeTab.path)}
                value={activeTab.content}
                onChange={updateActiveContent}
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
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
      />
    </div>
  );
}
