import { useState } from "react";
import type { AssistantMessage, OpenTab, RunResult, SuggestedEdit } from "./types";

type AIAssistantPanelProps = {
  activeTab: OpenTab | null;
  openTabs: OpenTab[];
  runResult: RunResult | null;
  workspacePath: string | null;
  onEditsApplied: (filePaths: string[]) => Promise<void>;
  onStatus: (message: string) => void;
};

function createMessage(
  role: AssistantMessage["role"],
  content: string,
  suggestedEdits?: SuggestedEdit[],
): AssistantMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    suggestedEdits,
  };
}

function buildTerminalOutput(runResult: RunResult | null): string {
  if (!runResult) return "";

  return [
    `Command: ${runResult.command}`,
    `Exit code: ${runResult.exitCode ?? "unknown"}`,
    runResult.stdout ? `STDOUT:\n${runResult.stdout}` : "",
    runResult.stderr ? `STDERR:\n${runResult.stderr}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || filePath;
}

function previewSnippet(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 320) return trimmed;
  return `${trimmed.slice(0, 320)}...`;
}

export default function AIAssistantPanel({
  activeTab,
  openTabs,
  runResult,
  workspacePath,
  onEditsApplied,
  onStatus,
}: AIAssistantPanelProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([
    createMessage(
      "system",
      "SVANSAI can inspect the opened workspace, find files/folders, explain errors, and propose code edits or new files. Changes are applied only after you approve them.",
    ),
  ]);
  const [loading, setLoading] = useState(false);
  const [applyingEditIds, setApplyingEditIds] = useState<Set<string>>(new Set());

  const activeTextTab = activeTab?.kind === "text" ? activeTab : null;

  async function sendMessage() {
    const trimmed = input.trim();

    if (!trimmed) {
      onStatus("Ask SVANSAI a question first.");
      return;
    }

    if (!workspacePath) {
      onStatus("Open a workspace before using SVANSAI Assistant.");
      return;
    }

    const userMessage = createMessage("user", trimmed);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    onStatus("SVANSAI is reviewing the workspace context...");

    try {
      const response = await window.sandboxApi.askAssistant({
        message: trimmed,
        currentFile: activeTextTab
          ? {
              path: activeTextTab.path,
              content: activeTextTab.content,
            }
          : null,
        openFiles: openTabs.map((tab) => ({
          path: tab.path,
          name: tab.name,
        })),
        terminalOutput: buildTerminalOutput(runResult),
      });

      setMessages((current) => [
        ...current,
        createMessage("assistant", response.message, response.suggestedEdits),
      ]);
      onStatus(
        response.suggestedEdits.length > 0
          ? `SVANSAI suggested ${response.suggestedEdits.length} edit${response.suggestedEdits.length === 1 ? "" : "s"}.`
          : "SVANSAI response received.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SVANSAI Assistant failed.";
      setMessages((current) => [...current, createMessage("assistant", message)]);
      onStatus(message);
    } finally {
      setLoading(false);
    }
  }

  async function applyEdit(edit: SuggestedEdit) {
    const confirmed = window.confirm(
      `${edit.operation === "create" ? "Create" : "Apply SVANSAI edit to"} ${basename(edit.filePath)}?\n\n${edit.explanation}`,
    );

    if (!confirmed) return;

    setApplyingEditIds((current) => new Set(current).add(edit.id));
    onStatus(`Applying SVANSAI edit: ${basename(edit.filePath)}...`);

    try {
      const result = await window.sandboxApi.applyAssistantEdits([edit]);
      const appliedPaths = result.results
        .filter((item) => item.ok)
        .map((item) => item.filePath);

      if (appliedPaths.length > 0) {
        await onEditsApplied(appliedPaths);
      }

      const resultText = result.results
        .map((item) => `${item.ok ? "Applied" : "Skipped"} ${basename(item.filePath)}: ${item.message}`)
        .join("\n");

      setMessages((current) => [
        ...current,
        createMessage("system", resultText || "No edit result returned."),
      ]);
      onStatus(result.ok ? "SVANSAI edit applied." : "Some SVANSAI edits were skipped.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to apply SVANSAI edit.";
      setMessages((current) => [...current, createMessage("system", message)]);
      onStatus(message);
    } finally {
      setApplyingEditIds((current) => {
        const next = new Set(current);
        next.delete(edit.id);
        return next;
      });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <aside className="assistant-panel">
      <div className="assistant-header">
        <div>
          <div className="assistant-eyebrow">SVANSAI</div>
          <h3>Code Assistant</h3>
        </div>
        <span className="status-pill">{workspacePath ? "Ready" : "No workspace"}</span>
      </div>

      <div className="assistant-context">
        <span>Context</span>
        <strong>{activeTextTab ? activeTextTab.name : "Workspace-aware"}</strong>
      </div>

      <div className="assistant-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`assistant-message assistant-message--${message.role}`}
          >
            <div className="assistant-message-role">
              {message.role === "assistant"
                ? "SVANSAI"
                : message.role === "user"
                  ? "You"
                  : "System"}
            </div>
            <div className="assistant-message-body">{message.content}</div>

            {message.suggestedEdits && message.suggestedEdits.length > 0 && (
              <div className="suggested-edits">
                {message.suggestedEdits.map((edit) => (
                  <div key={edit.id} className="suggested-edit">
                    <div className="suggested-edit-header">
                      <strong>{edit.operation === "create" ? `Create ${basename(edit.filePath)}` : basename(edit.filePath)}</strong>
                      <button
                        type="button"
                        className="primary-btn compact-btn"
                        onClick={() => void applyEdit(edit)}
                        disabled={applyingEditIds.has(edit.id)}
                      >
                        {applyingEditIds.has(edit.id) ? "Applying..." : edit.operation === "create" ? "Create" : "Apply"}
                      </button>
                    </div>
                    <p>{edit.explanation}</p>
                    <div className="diff-preview">
                      <div>
                        <span>{edit.operation === "create" ? "New file" : "Before"}</span>
                        <pre>{edit.operation === "create" ? previewSnippet(edit.replacementText) : previewSnippet(edit.originalText)}</pre>
                      </div>
                      <div>
                        <span>{edit.operation === "create" ? "Action" : "After"}</span>
                        <pre>{edit.operation === "create" ? "Create this file inside the opened workspace." : previewSnippet(edit.replacementText)}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="assistant-input">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask SVANSAI to review the project, find a file, explain errors, or suggest edits..."
          disabled={loading || !workspacePath}
        />
        <button
          type="button"
          className="primary-btn"
          onClick={() => void sendMessage()}
          disabled={loading || !workspacePath}
        >
          {loading ? "Thinking..." : "Ask SVANSAI"}
        </button>
      </div>
    </aside>
  );
}
