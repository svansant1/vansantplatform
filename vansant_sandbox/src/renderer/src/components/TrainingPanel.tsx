import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

type TrainingFile = {
  name: string;
  language: string;
  code: string;
  typed: string;
};

function titleCase(text: string): string {
  const words = text
    .replace(/[^a-z0-9 ]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

  if (words.length === 0) return "Starter App";

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferProjectKind(idea: string): string {
  const lower = idea.toLowerCase();

  if (/quiz|trivia|question/.test(lower)) return "quiz";
  if (/portfolio|landing|website|site|business/.test(lower)) return "landing";
  if (/habit|routine|streak/.test(lower)) return "habit";
  if (/dashboard|stats|weather|analytics/.test(lower)) return "dashboard";

  return "tasks";
}

function projectCopy(kind: string) {
  const copy = {
    quiz: {
      accent: "Quiz",
      subhead: "Answer one question, get instant feedback, then change the data to make it yours.",
    },
    landing: {
      accent: "Website",
      subhead: "A clean one-page website with a headline, call-to-action, and feature cards.",
    },
    habit: {
      accent: "Habits",
      subhead: "Add a habit, mark progress, and practice changing arrays on the page.",
    },
    dashboard: {
      accent: "Dashboard",
      subhead: "Display metrics, update values, and learn how data becomes interface.",
    },
    tasks: {
      accent: "Tasks",
      subhead: "Add tasks, complete them, and watch JavaScript update the page.",
    },
  } as const;

  return copy[kind as keyof typeof copy] ?? copy.tasks;
}

function generateProjectFiles(idea: string): TrainingFile[] {
  const kind = inferProjectKind(idea);
  const name = titleCase(idea);
  const copy = projectCopy(kind);
  const bodyByKind: Record<string, string[]> = {
    quiz: [
      '      <div class="card">',
      '        <p class="tag">Question</p>',
      "        <h2>What does CSS control?</h2>",
      '        <input id="answer" placeholder="Type your answer" />',
      '        <button id="action">Check answer</button>',
      '        <p id="result">Waiting for your answer...</p>',
      "      </div>",
    ],
    landing: [
      '      <div class="card">',
      '        <p class="tag">Simple offer</p>',
      "        <h2>Build faster with a page that explains itself.</h2>",
      '        <button id="action">Start now</button>',
      '        <p id="result">Click the button to change this text.</p>',
      "      </div>",
    ],
    habit: [
      '      <div class="card">',
      '        <p class="tag">Today</p>',
      '        <input id="habit" placeholder="Add a habit" />',
      '        <button id="action">Add habit</button>',
      '        <ul id="list"><li>Drink water</li><li>Practice code</li></ul>',
      "      </div>",
    ],
    dashboard: [
      '      <div class="stats">',
      '        <div><strong id="users">128</strong><span>Users</span></div>',
      '        <div><strong id="sales">42</strong><span>Sales</span></div>',
      '        <div><strong id="score">91%</strong><span>Score</span></div>',
      "      </div>",
      '      <button id="action">Refresh stats</button>',
      '      <p id="result">The dashboard is ready.</p>',
    ],
    tasks: [
      '      <div class="card">',
      '        <input id="task" placeholder="Add a task" />',
      '        <button id="action">Add task</button>',
      '        <ul id="list"><li>Learn variables</li><li>Build a feature</li></ul>',
      "      </div>",
    ],
  };
  const scriptByKind: Record<string, string[]> = {
    quiz: [
      'const answer = document.querySelector("#answer");',
      'const result = document.querySelector("#result");',
      'document.querySelector("#action").addEventListener("click", () => {',
      '  if (answer.value.toLowerCase().includes("style")) {',
      '    result.textContent = "Correct. CSS controls style and layout.";',
      "  } else {",
      '    result.textContent = "Try again: think colors, spacing, and layout.";',
      "  }",
      "});",
    ],
    landing: [
      'const result = document.querySelector("#result");',
      'document.querySelector("#action").addEventListener("click", () => {',
      '  result.textContent = "Nice. You just made the page respond to a click.";',
      "});",
    ],
    habit: [
      'const habit = document.querySelector("#habit");',
      'const list = document.querySelector("#list");',
      'document.querySelector("#action").addEventListener("click", () => {',
      '  if (habit.value.trim() === "") return;',
      '  const item = document.createElement("li");',
      "  item.textContent = habit.value;",
      "  list.appendChild(item);",
      '  habit.value = "";',
      "});",
    ],
    dashboard: [
      'const users = document.querySelector("#users");',
      'const sales = document.querySelector("#sales");',
      'const result = document.querySelector("#result");',
      'document.querySelector("#action").addEventListener("click", () => {',
      "  users.textContent = 128 + Math.floor(Math.random() * 50);",
      "  sales.textContent = 42 + Math.floor(Math.random() * 10);",
      '  result.textContent = "Stats refreshed with JavaScript.";',
      "});",
    ],
    tasks: [
      'const task = document.querySelector("#task");',
      'const list = document.querySelector("#list");',
      'document.querySelector("#action").addEventListener("click", () => {',
      '  if (task.value.trim() === "") return;',
      '  const item = document.createElement("li");',
      "  item.textContent = task.value;",
      "  list.appendChild(item);",
      '  task.value = "";',
      "});",
    ],
  };

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${name}</title>`,
    '  <link rel="stylesheet" href="styles.css" />',
    "</head>",
    "<body>",
    "  <main>",
    `    <p class="tag">${copy.accent}</p>`,
    `    <h1>${name}</h1>`,
    `    <p>${copy.subhead}</p>`,
    ...bodyByKind[kind],
    "  </main>",
    '  <script src="app.js"></script>',
    "</body>",
    "</html>",
  ].join("\n");

  const css = [
    "body {",
    "  margin: 0;",
    "  min-height: 100vh;",
    "  display: grid;",
    "  place-items: center;",
    "  background: #f4f1ea;",
    "  color: #18201f;",
    "  font-family: Arial, sans-serif;",
    "}",
    "",
    "main {",
    "  width: min(720px, 92vw);",
    "  padding: 32px;",
    "  background: #fffdf8;",
    "  border: 1px solid #ddd8cd;",
    "  border-radius: 18px;",
    "  box-shadow: 0 18px 50px rgba(24, 32, 31, 0.12);",
    "}",
    "",
    "h1 {",
    "  margin: 0 0 10px;",
    "  font-size: 42px;",
    "}",
    "",
    "p {",
    "  line-height: 1.6;",
    "}",
    "",
    ".tag {",
    "  color: #e55a2c;",
    "  font-weight: 700;",
    "  text-transform: uppercase;",
    "}",
    "",
    "input {",
    "  padding: 12px;",
    "  border: 1px solid #ccc;",
    "  border-radius: 8px;",
    "}",
    "",
    "button {",
    "  padding: 12px 14px;",
    "  border: 0;",
    "  border-radius: 8px;",
    "  background: #256f5b;",
    "  color: white;",
    "  font-weight: 700;",
    "}",
    "",
    ".card,",
    ".stats {",
    "  display: grid;",
    "  gap: 12px;",
    "  margin-top: 22px;",
    "}",
    "",
    ".stats {",
    "  grid-template-columns: repeat(3, 1fr);",
    "}",
    "",
    ".stats div {",
    "  padding: 18px;",
    "  background: #d8e9e1;",
    "  border-radius: 12px;",
    "}",
    "",
    ".stats strong {",
    "  display: block;",
    "  font-size: 30px;",
    "}",
    "",
    "li {",
    "  margin: 8px 0;",
    "}",
  ].join("\n");

  return [
    { name: "index.html", language: "HTML", code: html, typed: "" },
    { name: "styles.css", language: "CSS", code: css, typed: "" },
    { name: "app.js", language: "JS", code: scriptByKind[kind].join("\n"), typed: "" },
  ];
}

function visibleKey(char: string | undefined): string {
  if (char === "\n") return "Enter";
  if (char === " ") return "Space";
  if (char === "\t") return "Tab";
  return char || "nothing";
}

function assemblePreview(files: TrainingFile[]): string {
  const html = files.find((file) => file.name === "index.html")?.typed || "";
  const css = files.find((file) => file.name === "styles.css")?.typed || "";
  const js = files.find((file) => file.name === "app.js")?.typed || "";

  return html
    .replace(
      '<link rel="stylesheet" href="styles.css" />',
      `<style>\n${css}\n</style>`,
    )
    .replace('<script src="app.js"></script>', `<script>\n${js}\n</script>`);
}

export default function TrainingPanel() {
  const [idea, setIdea] = useState("");
  const [files, setFiles] = useState<TrainingFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState("Type a project idea, then generate a training trace.");
  const [previewHtml, setPreviewHtml] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeFile = files[activeIndex] ?? null;
  const complete = files.length > 0 && files.every((file) => file.typed === file.code);
  const remaining = activeFile ? activeFile.code.slice(activeFile.typed.length) : "";
  const percent = activeFile ? Math.round((activeFile.typed.length / activeFile.code.length) * 100) : 0;

  const remainingPreview = useMemo(() => {
    if (!activeFile) return "";
    if (!remaining) return `${activeFile.name} complete. Choose another file or preview the project.`;

    return remaining;
  }, [activeFile, remaining]);

  function updateActiveFile(nextTyped: string) {
    setFiles((current) =>
      current.map((file, index) =>
        index === activeIndex ? { ...file, typed: nextTyped } : file,
      ),
    );
  }

  function generateTrace() {
    const trimmedIdea = idea.trim();

    if (!trimmedIdea) {
      setFeedback("Enter the kind of app or website you want first.");
      return;
    }

    setFiles(generateProjectFiles(trimmedIdea));
    setActiveIndex(0);
    setPreviewHtml("");
    setFeedback("Generated a multi-file project. Start typing index.html or choose another file.");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function acceptText(text: string) {
    if (!activeFile) return;

    let nextTyped = activeFile.typed;
    let accepted = "";

    for (const char of text) {
      const expected = activeFile.code[nextTyped.length];

      if (char !== expected) {
        setFeedback(
          accepted
            ? `Accepted ${accepted.length} character(s), then stopped. Expected ${visibleKey(expected)}, got ${visibleKey(char)}.`
            : `Wrong key. Expected ${visibleKey(expected)}, got ${visibleKey(char)}.`,
        );
        updateActiveFile(nextTyped);
        return;
      }

      nextTyped += char;
      accepted += char;
    }

    updateActiveFile(nextTyped);
    setFeedback(accepted ? `Accepted: ${accepted.split("").map(visibleKey).join(" ")}` : "Ready.");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!activeFile) return;

    if (event.ctrlKey || event.metaKey) {
      if (["v", "x", "a"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        setFeedback("Paste and bulk editing are disabled in Training.");
      }
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      updateActiveFile(activeFile.typed.slice(0, -1));
      setFeedback("Backed up one character.");
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Delete"].includes(event.key)) {
      event.preventDefault();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (activeFile.code.slice(activeFile.typed.length, activeFile.typed.length + 2) === "  ") {
        acceptText("  ");
      } else {
        setFeedback(`Next key should be ${visibleKey(activeFile.code[activeFile.typed.length])}.`);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      acceptText("\n");
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      acceptText(event.key);
    }
  }

  function previewProject() {
    if (!files.length) {
      setFeedback("Generate a project first.");
      return;
    }

    setPreviewHtml(assemblePreview(files));
    setFeedback(
      complete
        ? "Previewing the completed project."
        : "Previewing typed files so far. Missing file content may make it look incomplete.",
    );
  }

  return (
    <div className="training-panel">
      <section className="training-hero">
        <div>
          <div className="eyebrow">Training</div>
          <h2>Type project files into existence.</h2>
          <p>
            Generate a multi-file project, then type each file manually. The next correct
            character disappears from the remaining code; paste and bulk edits are blocked.
          </p>
        </div>

        <div className="training-prompt">
          <label htmlFor="training-idea">Project idea</label>
          <div>
            <input
              id="training-idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") generateTrace();
              }}
              placeholder="Example: a quiz app, portfolio website, habit tracker..."
            />
            <button type="button" className="primary-btn" onClick={generateTrace}>
              Generate Training
            </button>
          </div>
        </div>
      </section>

      <section className="training-workbench">
        <aside className="training-files" aria-label="Training project files">
          {files.length ? (
            files.map((file, index) => {
              const filePercent = Math.round((file.typed.length / file.code.length) * 100);

              return (
                <button
                  key={file.name}
                  type="button"
                  className={`training-file-card${index === activeIndex ? " training-file-card-active" : ""}`}
                  onClick={() => {
                    setActiveIndex(index);
                    window.setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                >
                  <span>{file.language}</span>
                  <strong>{file.name}</strong>
                  <small>{file.typed.length} / {file.code.length} · {filePercent}%</small>
                </button>
              );
            })
          ) : (
            <div className="training-empty-files">No files generated yet.</div>
          )}
        </aside>

        <div className="training-editor-grid">
          <div className="training-code-panel">
            <div className="training-panel-label">
              Remaining Code {activeFile ? `· ${activeFile.name}` : ""}
            </div>
            <pre className="training-code-block">
              {activeFile && remaining ? (
                <>
                  <mark>{remaining[0]}</mark>
                  {remaining.slice(1)}
                </>
              ) : (
                remainingPreview
              )}
            </pre>
          </div>

          <div className="training-code-panel">
            <div className="training-panel-label">
              Typed File · Paste Disabled {activeFile ? `· ${percent}%` : ""}
            </div>
            <textarea
              ref={inputRef}
              value={activeFile?.typed ?? ""}
              onKeyDown={handleKeyDown}
              onPaste={(event) => {
                event.preventDefault();
                setFeedback("Paste is blocked. Type each character to make it stick.");
              }}
              onDrop={(event) => {
                event.preventDefault();
                setFeedback("Drag-and-drop text is blocked in Training.");
              }}
              onCut={(event) => event.preventDefault()}
              onContextMenu={(event) => event.preventDefault()}
              readOnly
              spellCheck={false}
              aria-label="Training typed file"
            />
          </div>
        </div>

        <div className="training-actions">
          <button type="button" className="primary-btn" onClick={previewProject}>
            Preview Typed Project
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              if (!activeFile) {
                setFeedback("Generate a project first.");
                return;
              }
              setFeedback(`Next key: ${visibleKey(activeFile.code[activeFile.typed.length])}`);
              inputRef.current?.focus();
            }}
          >
            Show Next Key
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              if (!activeFile) return;
              updateActiveFile("");
              setFeedback(`${activeFile.name} restarted.`);
              inputRef.current?.focus();
            }}
          >
            Restart File
          </button>
        </div>

        <div className="training-feedback">{feedback}</div>

        <div className="training-preview">
          <div className="training-panel-label">Project Preview</div>
          <iframe title="Training project preview" srcDoc={previewHtml} />
        </div>
      </section>
    </div>
  );
}
