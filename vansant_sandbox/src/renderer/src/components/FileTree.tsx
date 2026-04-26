import React from "react";
import type { FileNode } from "./types";

type Props = {
  nodes: FileNode[];
  activePath: string | null;
  onOpenFile: (filePath: string) => void;
};

function TreeNode({
  node,
  depth,
  activePath,
  onOpenFile,
}: {
  node: FileNode;
  depth: number;
  activePath: string | null;
  onOpenFile: (filePath: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(depth < 1);

  if (node.type === "file") {
    return (
      <button
        type="button"
        className={`tree-node ${activePath === node.path ? "tree-node-active" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        onClick={() => onOpenFile(node.path)}
        title={node.path}
      >
        <span className="tree-icon">📄</span>
        <span className="tree-label">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="tree-node"
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        onClick={() => setExpanded((prev) => !prev)}
        title={node.path}
      >
        <span className="tree-icon">{expanded ? "📂" : "📁"}</span>
        <span className="tree-label">{node.name}</span>
      </button>

      {expanded &&
        node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onOpenFile={onOpenFile}
          />
        ))}
    </div>
  );
}

export default function FileTree({ nodes, activePath, onOpenFile }: Props) {
  if (nodes.length === 0) {
    return <div className="empty-pane">No files in this folder.</div>;
  }

  return (
    <div className="tree-root">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}
