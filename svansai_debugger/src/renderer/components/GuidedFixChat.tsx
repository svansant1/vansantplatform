import type { ChatMessage } from "../hooks/useGuidedChat";

type GuidedFixChatProps = {
  selectedFinding: ScanFinding | null;
  messages: ChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onMarkTried: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  disabled: boolean;
  attemptedFixes: string[];
};

// Inline renderer for common markdown patterns returned by AI
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Patterns: **bold**, *italic*, `code`
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[2] !== undefined) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      parts.push(
        <code key={match.index} className="chat-inline-code">
          {match[4]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length === 1 && typeof parts[0] === "string"
    ? parts[0]
    : parts;
}

function MarkdownBody({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let codeLines: string[] | null = null;
  let bulletItems: React.ReactNode[] = [];
  let orderedItems: React.ReactNode[] = [];

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="chat-md-list">
          {bulletItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
      bulletItems = [];
    }
  };

  const flushOrdered = () => {
    if (orderedItems.length > 0) {
      nodes.push(
        <ol key={`ol-${nodes.length}`} className="chat-md-list">
          {orderedItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>,
      );
      orderedItems = [];
    }
  };

  for (const line of lines) {
    // Code fence toggle
    if (line.startsWith("```")) {
      if (codeLines !== null) {
        nodes.push(
          <pre key={`code-${nodes.length}`} className="chat-code-block">
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        codeLines = null;
      } else {
        flushBullets();
        flushOrdered();
        codeLines = [];
      }
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      flushBullets();
      flushOrdered();
      nodes.push(
        <p key={`h3-${nodes.length}`} className="chat-md-heading">
          {renderInline(line.slice(4))}
        </p>,
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushBullets();
      flushOrdered();
      nodes.push(
        <p key={`h2-${nodes.length}`} className="chat-md-heading">
          {renderInline(line.slice(3))}
        </p>,
      );
      continue;
    }

    // Bullet list
    if (/^[-*+] /.test(line)) {
      flushOrdered();
      bulletItems.push(renderInline(line.slice(2)));
      continue;
    }

    // Ordered list
    const orderedMatch = /^\d+\. (.*)/.exec(line);
    if (orderedMatch) {
      flushBullets();
      orderedItems.push(renderInline(orderedMatch[1]));
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      flushBullets();
      flushOrdered();
      continue;
    }

    // Normal paragraph line
    flushBullets();
    flushOrdered();
    nodes.push(
      <p key={`p-${nodes.length}`} className="chat-md-p">
        {renderInline(line)}
      </p>,
    );
  }

  // Flush any remaining
  if (codeLines !== null) {
    nodes.push(
      <pre key={`code-end`} className="chat-code-block">
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }
  flushBullets();
  flushOrdered();

  return <div className="chat-md-body">{nodes}</div>;
}

export function GuidedFixChat({
  selectedFinding,
  messages,
  input,
  onInputChange,
  onSend,
  onMarkTried,
  onKeyDown,
  isLoading,
  disabled,
  attemptedFixes,
}: GuidedFixChatProps) {
  return (
    <div className="notes-box" style={{ marginTop: 20 }}>
      <div className="notes-box__title">Guided Fix Chat</div>

      {!selectedFinding ? (
        <p className="notes-box__text">
          Select a warning or problem finding and open Guided Fix Chat.
        </p>
      ) : (
        <>
          <p className="notes-box__text">
            <strong>Focused Finding:</strong> {selectedFinding.item}
          </p>

          <div className="chat-history">
            {messages.length === 0 ? (
              <p className="notes-box__text">No guided fix messages yet.</p>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`chat-bubble chat-bubble--${message.role}`}
                >
                  <div className="chat-bubble__label">
                    {message.role === "assistant"
                      ? "SVANSAI"
                      : message.role === "user"
                        ? "You"
                        : "System"}
                  </div>
                  <div className="chat-bubble__body">
                    {message.role === "assistant" ? (
                      <MarkdownBody text={message.content} />
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask how to fix this, or describe what already failed… (Ctrl+Enter to send)"
            className="input"
            style={{ minHeight: 110, marginTop: 14, resize: "vertical" }}
            disabled={disabled}
          />

          <div className="action-grid" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button button--primary"
              onClick={onSend}
              disabled={disabled || isLoading}
            >
              {isLoading ? "Thinking..." : "Send to SVANSAI"}
            </button>

            <button
              type="button"
              className="button button--secondary"
              onClick={onMarkTried}
              disabled={disabled || isLoading}
            >
              I Tried That
            </button>
          </div>

          {attemptedFixes.length > 0 && (
            <p
              className="notes-box__text"
              style={{ marginTop: 12, whiteSpace: "pre-wrap" }}
            >
              <strong>Attempted Fixes:</strong>
              {"\n"}
              {attemptedFixes
                .map((item, index) => `${index + 1}. ${item}`)
                .join("\n")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
