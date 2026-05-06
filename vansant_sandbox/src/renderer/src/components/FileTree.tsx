import React from "react";
import type { FileNode } from "./types";

type EntryType = "file" | "directory";

type ContextTarget =
  | {
      kind: "node";
      node: FileNode;
      x: number;
      y: number;
    }
  | {
      kind: "empty";
      x: number;
      y: number;
    };

type Props = {
  nodes: FileNode[];
  activePath: string | null;
  onOpenFile: (filePath: string) => void;
  onCreateEntry: (parentDir: string | null, type: EntryType) => void;
  onRenameEntry: (node: FileNode) => void;
  onDeleteEntry: (node: FileNode) => void;
};

function TreeNode({
  node,
  depth,
  activePath,
  onOpenFile,
  onContextMenu,
}: {
  node: FileNode;
  depth: number;
  activePath: string | null;
  onOpenFile: (filePath: string) => void;
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void;
}) {
  const [expanded, setExpanded] = React.useState(depth < 1);

  const isFile = node.type === "file";

  const extension = node.name.split(".").pop()?.toLowerCase();

  function getFileIcon() {
    if (!isFile) {
      return expanded ? "📂" : "📁";
    }

    switch (extension) {
      case "ts":
        return "📘";

      case "tsx":
        return "⚛️";

      case "js":
      case "jsx":
        return "📙";

      case "json":
        return "🟨";

      case "css":
        return "🎨";

      case "html":
        return "🌐";

      case "md":
        return "📝";

      case "py":
        return "🐍";

      case "java":
        return "☕";

      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
      case "ico":
        return "🖼️";

      default:
        return "📄";
    }
  }

  return (
    <div>
      <button
        type="button"
        className={`tree-node ${
          activePath === node.path ? "tree-node-active" : ""
        }`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        onClick={() => {
          if (isFile) {
            onOpenFile(node.path);
            return;
          }

          setExpanded((prev) => !prev);
        }}
        onContextMenu={(event) => onContextMenu(event, node)}
        title={node.path}
      >
        <span className="tree-arrow">
          {!isFile ? (expanded ? "▼" : "▶") : ""}
        </span>

        <span className="tree-icon">{getFileIcon()}</span>

        <span className="tree-label">{node.name}</span>
      </button>

      {!isFile &&
        expanded &&
        node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        ))}
    </div>
  );
}

export default function FileTree({
  nodes,
  activePath,
  onOpenFile,
  onCreateEntry,
  onRenameEntry,
  onDeleteEntry,
}: Props) {
  const [contextTarget, setContextTarget] =
    React.useState<ContextTarget | null>(null);

  React.useEffect(() => {
    const close = () => setContextTarget(null);

    window.addEventListener("click", close);
    window.addEventListener("keydown", close);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  function openNodeMenu(event: React.MouseEvent, node: FileNode) {
    event.preventDefault();
    event.stopPropagation();

    setContextTarget({
      kind: "node",
      node,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function openEmptyMenu(event: React.MouseEvent) {
    event.preventDefault();

    setContextTarget({
      kind: "empty",
      x: event.clientX,
      y: event.clientY,
    });
  }

  function getCreateParent(): string | null {
    if (!contextTarget || contextTarget.kind === "empty") {
      return null;
    }

    return contextTarget.node.type === "directory"
      ? contextTarget.node.path
      : null;
  }

  return (
    <div
      className="tree-root"
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          openEmptyMenu(event);
        }
      }}
    >
      {nodes.length === 0 ? (
        <div className="empty-pane">No files in this folder.</div>
      ) : (
        nodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            onOpenFile={onOpenFile}
            onContextMenu={openNodeMenu}
          />
        ))
      )}

      {contextTarget && (
        <div
          className="context-menu"
          style={{
            left: contextTarget.x,
            top: contextTarget.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {(contextTarget.kind === "empty" ||
            contextTarget.node.type === "directory") && (
            <>
              <button
                type="button"
                onClick={() => {
                  onCreateEntry(getCreateParent(), "file");
                  setContextTarget(null);
                }}
              >
                New File
              </button>

              <button
                type="button"
                onClick={() => {
                  onCreateEntry(getCreateParent(), "directory");
                  setContextTarget(null);
                }}
              >
                New Folder
              </button>

              <div className="context-menu-divider" />
            </>
          )}

          {contextTarget.kind === "node" && (
            <>
              <button
                type="button"
                onClick={() => {
                  onRenameEntry(contextTarget.node);
                  setContextTarget(null);
                }}
              >
                Rename
              </button>

              <button
                type="button"
                className="danger-context-item"
                onClick={() => {
                  onDeleteEntry(contextTarget.node);
                  setContextTarget(null);
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
