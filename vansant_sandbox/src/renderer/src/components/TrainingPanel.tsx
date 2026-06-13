import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

type TrainingFile = {
  name: string;
  language: string;
  code: string;
  typed: string;
  metrics: TrainingMetrics;
};

type TrainingMetrics = {
  mistakes: number;
  startedAt: number | null;
  completedAt: number | null;
};

type TrainingSaveState = {
  version: 1;
  idea: string;
  files: TrainingFile[];
  activeIndex: number;
  previewHtml: string;
  savedAt: number;
};

type TrainingConcept = {
  title: string;
  detail: string;
  source: string;
};

const TRAINING_SAVE_KEY = "vansant-sandbox:training-state:v1";

function createTrainingMetrics(): TrainingMetrics {
  return {
    mistakes: 0,
    startedAt: null,
    completedAt: null,
  };
}

function normalizeTrainingMetrics(metrics: Partial<TrainingMetrics> | undefined): TrainingMetrics {
  return {
    mistakes: typeof metrics?.mistakes === "number" ? metrics.mistakes : 0,
    startedAt: typeof metrics?.startedAt === "number" ? metrics.startedAt : null,
    completedAt: typeof metrics?.completedAt === "number" ? metrics.completedAt : null,
  };
}

function readSavedTrainingState(): TrainingSaveState | null {
  try {
    const raw = window.localStorage.getItem(TRAINING_SAVE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<TrainingSaveState>;

    if (
      parsed.version !== 1 ||
      typeof parsed.idea !== "string" ||
      !Array.isArray(parsed.files) ||
      typeof parsed.activeIndex !== "number"
    ) {
      return null;
    }

    const files = parsed.files.filter(
      (
        file,
      ): file is Omit<TrainingFile, "metrics"> & {
        metrics?: Partial<TrainingMetrics>;
      } =>
        Boolean(file) &&
        typeof file.name === "string" &&
        typeof file.language === "string" &&
        typeof file.code === "string" &&
        typeof file.typed === "string",
    ).map((file) => ({
      ...file,
      metrics: normalizeTrainingMetrics(file.metrics),
    }));

    return {
      version: 1,
      idea: parsed.idea,
      files,
      activeIndex: Math.max(0, Math.min(parsed.activeIndex, Math.max(files.length - 1, 0))),
      previewHtml: typeof parsed.previewHtml === "string" ? parsed.previewHtml : "",
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeSavedTrainingState(state: Omit<TrainingSaveState, "version" | "savedAt">): void {
  try {
    window.localStorage.setItem(
      TRAINING_SAVE_KEY,
      JSON.stringify({
        ...state,
        version: 1,
        savedAt: Date.now(),
      } satisfies TrainingSaveState),
    );
  } catch {
    // Training progress should never block typing if storage is unavailable.
  }
}

function clearSavedTrainingState(): void {
  try {
    window.localStorage.removeItem(TRAINING_SAVE_KEY);
  } catch {
    // Best effort.
  }
}

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
    { name: "index.html", language: "HTML", code: html, typed: "", metrics: createTrainingMetrics() },
    { name: "styles.css", language: "CSS", code: css, typed: "", metrics: createTrainingMetrics() },
    { name: "app.js", language: "JS", code: scriptByKind[kind].join("\n"), typed: "", metrics: createTrainingMetrics() },
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

function getFileStats(file: TrainingFile, now: number) {
  const correct = file.typed.length;
  const attempts = correct + file.metrics.mistakes;
  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
  const endTime = file.metrics.completedAt ?? now;
  const elapsedMs = file.metrics.startedAt ? Math.max(0, endTime - file.metrics.startedAt) : 0;
  const elapsedMinutes = elapsedMs / 60000;
  const wpm = elapsedMinutes > 0 ? Math.round(correct / 5 / elapsedMinutes) : 0;

  return {
    accuracy,
    mistakes: file.metrics.mistakes,
    wpm,
    elapsedMs,
  };
}

function formatTrainingTime(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}m:${seconds
    .toString()
    .padStart(2, "0")}s`;
}

function getTrainingExplanation(file: TrainingFile | null, idea: string) {
  if (!file) {
    return {
      title: "Explanation",
      description:
        "Generate a project and this section will explain what each file is teaching while you trace it.",
      learned:
        "You will learn how HTML, CSS, and JavaScript work together to turn an idea into an app.",
    };
  }

  if (file.language === "HTML") {
    return {
      title: "HTML Structure",
      description: `This file creates the bones of ${idea.trim() || "your project"}: headings, text, buttons, inputs, and the places JavaScript can target.`,
      learned:
        "You are learning page structure, semantic layout, linking CSS, and loading JavaScript.",
    };
  }

  if (file.language === "CSS") {
    return {
      title: "CSS Styling",
      description:
        "This file controls the look and feel: spacing, colors, layout, borders, and responsive visual polish.",
      learned:
        "You are learning selectors, reusable classes, layout rules, and visual hierarchy.",
    };
  }

  return {
    title: "JavaScript Behavior",
    description:
      "This file makes the project interactive by finding elements, listening for clicks, and changing what appears on the page.",
    learned:
      "You are learning DOM selection, event listeners, conditionals, variables, and UI updates.",
  };
}

function pushConcept(concepts: TrainingConcept[], title: string, detail: string, source: string) {
  if (concepts.some((concept) => concept.title === title && concept.source === source)) {
    return;
  }

  concepts.push({ title, detail, source });
}

function explainTypedLine(file: TrainingFile, line: string): TrainingConcept[] {
  const concepts: TrainingConcept[] = [];
  const trimmed = line.trim();

  if (!trimmed || trimmed === "}" || trimmed === "});" || trimmed.startsWith("</")) {
    return concepts;
  }

  if (file.language === "HTML") {
    if (trimmed.startsWith("<!doctype")) {
      pushConcept(concepts, "Document type", "Tells the browser this file uses modern HTML rules.", trimmed);
    }

    if (trimmed.startsWith("<html")) {
      pushConcept(concepts, "HTML root", "Starts the page and sets the language the browser should expect.", trimmed);
    }

    if (trimmed.startsWith("<head>")) {
      pushConcept(concepts, "Head section", "Holds setup information for the browser, not visible page content.", trimmed);
    }

    if (trimmed.startsWith("<meta charset")) {
      pushConcept(concepts, "Character encoding", "Lets the browser read normal letters, symbols, and punctuation correctly.", trimmed);
    }

    if (trimmed.startsWith("<meta name=\"viewport\"")) {
      pushConcept(concepts, "Responsive viewport", "Makes the layout scale correctly on different screen sizes.", trimmed);
    }

    if (trimmed.startsWith("<title>")) {
      pushConcept(concepts, "Page title", "Names the browser tab and helps identify the project.", trimmed);
    }

    if (trimmed.includes("rel=\"stylesheet\"")) {
      pushConcept(concepts, "CSS link", "Connects the HTML file to the stylesheet so styles can affect the page.", trimmed);
    }

    if (trimmed.startsWith("<body>") || trimmed.startsWith("<main>")) {
      pushConcept(concepts, "Visible page area", "Starts the part of the page that users actually see and use.", trimmed);
    }

    if (/^<h[1-6]/.test(trimmed)) {
      pushConcept(concepts, "Heading", "Creates a clear title or section label so the page has structure.", trimmed);
    }

    if (trimmed.startsWith("<p")) {
      pushConcept(concepts, "Paragraph text", "Adds readable explanation or status text to the interface.", trimmed);
    }

    if (trimmed.startsWith("<input")) {
      pushConcept(concepts, "Input field", "Creates a place where the user can type information into the app.", trimmed);
    }

    if (trimmed.startsWith("<button")) {
      pushConcept(concepts, "Button", "Creates an action the user can click, which JavaScript can listen for.", trimmed);
    }

    if (trimmed.startsWith("<ul") || trimmed.startsWith("<li")) {
      pushConcept(concepts, "List content", "Groups repeated items so the app can show more than one thing cleanly.", trimmed);
    }

    if (trimmed.startsWith("<script")) {
      pushConcept(concepts, "JavaScript link", "Loads the behavior file after the page structure is in place.", trimmed);
    }
  }

  if (file.language === "CSS") {
    if (trimmed.endsWith("{")) {
      pushConcept(concepts, "Selector block", "Chooses which HTML elements or classes the next style rules will affect.", trimmed);
    }

    if (trimmed.startsWith("margin:") || trimmed.startsWith("padding:")) {
      pushConcept(concepts, "Spacing", "Controls the room outside or inside an element so the design can breathe.", trimmed);
    }

    if (trimmed.startsWith("display:")) {
      pushConcept(concepts, "Layout mode", "Changes how children inside this element are arranged on the page.", trimmed);
    }

    if (trimmed.startsWith("grid-template") || trimmed.startsWith("place-items") || trimmed.startsWith("gap:")) {
      pushConcept(concepts, "Grid layout", "Uses CSS grid rules to align content and keep spacing consistent.", trimmed);
    }

    if (trimmed.startsWith("width:") || trimmed.startsWith("min-height:")) {
      pushConcept(concepts, "Sizing rule", "Sets how much space an element can take up in the layout.", trimmed);
    }

    if (trimmed.startsWith("background:") || trimmed.startsWith("color:")) {
      pushConcept(concepts, "Color styling", "Controls surface colors and text colors so the interface is readable.", trimmed);
    }

    if (trimmed.startsWith("font-") || trimmed.startsWith("font:")) {
      pushConcept(concepts, "Typography", "Controls how text looks, including size, weight, and font family.", trimmed);
    }

    if (trimmed.startsWith("border") || trimmed.startsWith("box-shadow")) {
      pushConcept(concepts, "Visual container", "Adds shape, edges, or depth so sections are easier to see.", trimmed);
    }

    if (trimmed.startsWith("line-height:")) {
      pushConcept(concepts, "Readable text", "Controls space between lines so paragraphs are easier to read.", trimmed);
    }
  }

  if (file.language === "JS") {
    if (trimmed.startsWith("const ")) {
      pushConcept(concepts, "Variable", "Stores a value with a name so the code can reuse it later.", trimmed);
    }

    if (trimmed.includes("document.querySelector")) {
      pushConcept(concepts, "DOM selection", "Finds an HTML element so JavaScript can read it or change it.", trimmed);
    }

    if (trimmed.includes("addEventListener")) {
      pushConcept(concepts, "Event listener", "Waits for a user action, like a click, then runs a block of code.", trimmed);
    }

    if (trimmed.startsWith("if ")) {
      pushConcept(concepts, "Conditional block", "Runs code only when a condition is true, which lets the app make decisions.", trimmed);
    }

    if (trimmed.includes("return")) {
      pushConcept(concepts, "Early stop", "Stops the current function so invalid or empty input does not continue.", trimmed);
    }

    if (trimmed.includes("createElement")) {
      pushConcept(concepts, "Create element", "Builds a new HTML element from JavaScript instead of writing it by hand in HTML.", trimmed);
    }

    if (trimmed.includes(".textContent")) {
      pushConcept(concepts, "Text update", "Changes what the user sees on the page without reloading.", trimmed);
    }

    if (trimmed.includes("appendChild")) {
      pushConcept(concepts, "Add to page", "Places a newly created element inside an existing part of the page.", trimmed);
    }

    if (trimmed.includes(".value")) {
      pushConcept(concepts, "Input value", "Reads or resets what the user typed into an input field.", trimmed);
    }

    if (trimmed.includes("Math.random")) {
      pushConcept(concepts, "Random value", "Creates changing data so the interface can update with different numbers.", trimmed);
    }
  }

  return concepts;
}

function getTypedTrainingConcepts(file: TrainingFile | null): TrainingConcept[] {
  if (!file) return [];

  const completedLines = file.typed.endsWith("\n")
    ? file.typed.split("\n").slice(0, -1)
    : file.typed.split("\n").slice(0, -1);

  return completedLines.flatMap((line) => explainTypedLine(file, line)).slice(-8);
}

function getNextTrainingConcept(file: TrainingFile | null): TrainingConcept | null {
  if (!file) return null;

  const remainingLines = file.code.slice(file.typed.length).split("\n");

  for (const line of remainingLines) {
    const concepts = explainTypedLine(file, line);
    if (concepts.length) return concepts[0];
  }

  return null;
}

export default function TrainingPanel() {
  const savedState = useMemo(() => readSavedTrainingState(), []);
  const [idea, setIdea] = useState(savedState?.idea ?? "");
  const [files, setFiles] = useState<TrainingFile[]>(savedState?.files ?? []);
  const [activeIndex, setActiveIndex] = useState(savedState?.activeIndex ?? 0);
  const [feedback, setFeedback] = useState(
    savedState?.files.length
      ? "Restored your saved training progress."
      : "Type a project idea, then generate a training trace.",
  );
  const [previewHtml, setPreviewHtml] = useState(savedState?.previewHtml ?? "");
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    writeSavedTrainingState({
      idea,
      files,
      activeIndex,
      previewHtml,
    });
  }, [activeIndex, files, idea, previewHtml]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  const activeFile = files[activeIndex] ?? null;
  const complete = files.length > 0 && files.every((file) => file.typed === file.code);
  const remaining = activeFile ? activeFile.code.slice(activeFile.typed.length) : "";
  const percent = activeFile ? Math.round((activeFile.typed.length / activeFile.code.length) * 100) : 0;
  const explanation = getTrainingExplanation(activeFile, idea);
  const typedConcepts = getTypedTrainingConcepts(activeFile);
  const nextConcept = getNextTrainingConcept(activeFile);

  const remainingPreview = useMemo(() => {
    if (!activeFile) return "";
    if (!remaining) return `${activeFile.name} complete. Choose another file or preview the project.`;

    return remaining;
  }, [activeFile, remaining]);

  function updateActiveFile(
    nextTyped: string,
    updateMetrics?: (metrics: TrainingMetrics, file: TrainingFile) => TrainingMetrics,
  ) {
    setFiles((current) =>
      current.map((file, index) => {
        if (index !== activeIndex) return file;

        return {
          ...file,
          typed: nextTyped,
          metrics: updateMetrics ? updateMetrics(file.metrics, file) : file.metrics,
        };
      }),
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
        const wrongAt = Date.now();
        setFeedback(
          accepted
            ? `Accepted ${accepted.length} character(s), then stopped. Expected ${visibleKey(expected)}, got ${visibleKey(char)}.`
            : `Wrong key. Expected ${visibleKey(expected)}, got ${visibleKey(char)}.`,
        );
        updateActiveFile(nextTyped, (metrics, file) => ({
          ...metrics,
          mistakes: metrics.mistakes + 1,
          startedAt: metrics.startedAt ?? (file.typed.length > 0 || accepted ? wrongAt : null),
        }));
        return;
      }

      nextTyped += char;
      accepted += char;
    }

    const acceptedAt = Date.now();
    updateActiveFile(nextTyped, (metrics, file) => ({
      ...metrics,
      startedAt: metrics.startedAt ?? acceptedAt,
      completedAt:
        nextTyped.length === file.code.length ? metrics.completedAt ?? acceptedAt : null,
    }));
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
      updateActiveFile(activeFile.typed.slice(0, -1), (metrics) => ({
        ...metrics,
        completedAt: null,
      }));
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
        <aside className="training-sidebar" aria-label="Training project files and explanation">
          <div className="training-files">
            {files.length ? (
              files.map((file, index) => {
                const filePercent = Math.round((file.typed.length / file.code.length) * 100);
                const stats = getFileStats(file, now);

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
                    <div className="training-file-stats">
                      <small>Accuracy: {stats.accuracy}%</small>
                      <small>Mistakes: {stats.mistakes}</small>
                      <small>WPM: {stats.wpm}</small>
                      <small>Time: {formatTrainingTime(stats.elapsedMs)}</small>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="training-empty-files">No files generated yet.</div>
            )}
          </div>

          <div className="training-explanation">
            <div className="training-panel-label">Description</div>
            <div>
              <h3>{explanation.title}</h3>
              <p>{explanation.description}</p>
              <strong>What was learned</strong>
              <p>{explanation.learned}</p>
              <strong>Typed breakdown</strong>
              {typedConcepts.length ? (
                <div className="training-concept-list">
                  {typedConcepts.map((concept, index) => (
                    <div className="training-concept-card" key={`${concept.title}-${index}`}>
                      <span>{concept.title}</span>
                      <p>{concept.detail}</p>
                      <code>{concept.source}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Finish a line and this panel will explain what that section does.</p>
              )}
              {nextConcept ? (
                <>
                  <strong>Coming next</strong>
                  <div className="training-concept-card training-concept-next">
                    <span>{nextConcept.title}</span>
                    <p>{nextConcept.detail}</p>
                    <code>{nextConcept.source}</code>
                  </div>
                </>
              ) : null}
            </div>
          </div>
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
              updateActiveFile("", () => createTrainingMetrics());
              setFeedback(`${activeFile.name} restarted.`);
              inputRef.current?.focus();
            }}
          >
            Restart File
          </button>
          <button
            type="button"
            className="secondary-btn training-danger-btn"
            onClick={() => {
              const confirmed = window.confirm(
                "Clear all saved Training progress and start blank?",
              );

              if (!confirmed) return;

              clearSavedTrainingState();
              setIdea("");
              setFiles([]);
              setActiveIndex(0);
              setPreviewHtml("");
              setFeedback("Training progress cleared.");
            }}
          >
            Clear Training
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
