"use client";

import Link from "next/link";
import { useState } from "react";

type NodeType = "folder" | "file";

type SandboxNode = {
  id: string;
  name: string;
  type: NodeType;
  children?: SandboxNode[];
};

function createId() {
  return crypto.randomUUID();
}

function addChild(
  nodes: SandboxNode[],
  parentId: string,
  child: SandboxNode,
): SandboxNode[] {
  return nodes.map((node) => {
    if (node.id === parentId && node.type === "folder") {
      return {
        ...node,
        children: [...(node.children ?? []), child],
      };
    }

    return {
      ...node,
      children: node.children
        ? addChild(node.children, parentId, child)
        : undefined,
    };
  });
}

export default function SandboxPage() {
  const rootId = "root";

  const [tree, setTree] = useState<SandboxNode[]>([
    {
      id: rootId,
      name: "Vansant Sandbox",
      type: "folder",
      children: [],
    },
  ]);

  const addNode = (parentId: string, type: NodeType) => {
    const name = window.prompt(`New ${type} name:`)?.trim();
    if (!name) return;

    setTree((current) =>
      addChild(current, parentId, {
        id: createId(),
        name,
        type,
        children: type === "folder" ? [] : undefined,
      }),
    );
  };

  const renderNode = (node: SandboxNode) => (
    <div key={node.id} className="ml-4 mt-3">
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <span className="font-medium text-white">
          {node.type === "folder" ? "📁" : "📄"} {node.name}
        </span>

        {node.type === "folder" && (
          <div className="flex gap-2">
            <button
              onClick={() => addNode(node.id, "folder")}
              className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-white hover:bg-zinc-700"
            >
              + Folder
            </button>
            <button
              onClick={() => addNode(node.id, "file")}
              className="rounded-lg bg-purple-500 px-3 py-1 text-xs text-white hover:bg-purple-600"
            >
              + File
            </button>
          </div>
        )}
      </div>

      {node.children?.map(renderNode)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vansant Sandbox</h1>
        <p className="mt-2 text-zinc-400">
          Web sandbox for organizing folders and files inside your platform.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <div className="mb-5 flex flex-wrap gap-3">
          <button
            onClick={() => addNode(rootId, "folder")}
            className="rounded-xl bg-green-500 px-5 py-3 text-sm font-medium text-white hover:bg-green-600"
          >
            Add Folder
          </button>

          <button
            onClick={() => addNode(rootId, "file")}
            className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-medium text-white hover:bg-purple-600"
          >
            Add File
          </button>

          <a
            href="/downloads/Vansant-Sandbox.exe"
            download
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
          >
            Download Desktop Sandbox
          </a>

          <Link
            href="/dashboard"
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
          >
            Back to Dashboard
          </Link>
        </div>

        <div>{tree.map(renderNode)}</div>
      </div>
    </div>
  );
}
