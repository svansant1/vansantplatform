import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeLanguage, RunResult } from "./types";

type PracticePanelProps = {
  onStatus: (message: string) => void;
  onResult: (result: RunResult | null) => void;
};

const PRACTICE_SAVE_KEY = "vansant-sandbox:practice:v1";

const STARTER_CODE: Record<PracticeLanguage, string> = {
  svans: 'say "Welcome to SVANS Practice."\nask name "What is your name?"\nsay name\nset goal = "Build something real."\nsay goal\n',
  javascript: 'const fs = require("node:fs");\nconst name = fs.readFileSync(0, "utf8").trim() || "coder";\nconsole.log(`Hello, ${name}!`);\n',
  typescript: 'import fs from "node:fs";\nconst name = fs.readFileSync(0, "utf8").trim() || "coder";\nconsole.log(`Hello, ${name}!`);\n',
  python: 'name = input("What is your name? ")\nprint(f"Hello, {name}!")\n',
  powershell: '$name = Read-Host "What is your name?"\nWrite-Output "Hello, $name!"\n',
};

const STARTER_INPUT: Record<PracticeLanguage, string> = {
  svans: "Shawn\n",
  javascript: "Shawn\n",
  typescript: "Shawn\n",
  python: "Shawn\n",
  powershell: "Shawn\n",
};

type SavedPractice = {
  language: PracticeLanguage;
  code: string;
  input: string;
};

function readSavedPractice(): SavedPractice | null {
  try {
    const raw = window.localStorage.getItem(PRACTICE_SAVE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedPractice>;
    const languages: PracticeLanguage[] = ["javascript", "typescript", "python", "powershell", "svans"];

    if (
      !parsed.language ||
      !languages.includes(parsed.language) ||
      typeof parsed.code !== "string"
    ) {
      return null;
    }

    return {
      language: parsed.language,
      code: parsed.code,
      input: typeof parsed.input === "string" ? parsed.input : "",
    };
  } catch {
    return null;
  }
}

export default function PracticePanel({ onStatus, onResult }: PracticePanelProps) {
  const savedPractice = useMemo(() => readSavedPractice(), []);
  const [language, setLanguage] = useState<PracticeLanguage>(
    savedPractice?.language ?? "javascript",
  );
  const [code, setCode] = useState(
    savedPractice?.code ?? STARTER_CODE.javascript,
  );
  const [input, setInput] = useState(
    savedPractice?.input ?? STARTER_INPUT.javascript,
  );
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PRACTICE_SAVE_KEY,
        JSON.stringify({ language, code, input } satisfies SavedPractice),
      );
    } catch {
      // Practice autosave is best-effort.
    }
  }, [code, input, language]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  function stopVisibleRun() {
    runIdRef.current += 1;
    setRunning(false);
  }

  async function runPractice() {
    if (!code.trim()) {
      onStatus("Write something in Practice before running.");
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    try {
      setRunning(true);
      onStatus(`Running ${language} practice...`);

      const nextResult = await window.sandboxApi.runPractice(language, code, input);

      if (runIdRef.current !== runId) return;

      setResult(nextResult);
      onResult(nextResult);
      onStatus(
        nextResult.ok
          ? "Practice run complete."
          : "Practice run finished with errors.",
      );
    } catch (error) {
      if (runIdRef.current !== runId) return;

      const message =
        error instanceof Error ? error.message : "Failed to run practice code.";
      setResult({
        ok: false,
        command: "practice",
        stdout: "",
        stderr: message,
        exitCode: null,
      });
      onResult(null);
      onStatus(message);
    } finally {
      if (runIdRef.current === runId) {
        setRunning(false);
      }
    }
  }

  const output = result
    ? result.stderr || result.stdout || "No output."
    : "Click Run Practice to see output here.";

  return (
    <div className="practice-panel">
      <section className="practice-hero">
        <div>
          <div className="eyebrow">Practice</div>
          <h2>Write code, run it, see what happens.</h2>
          <p>
            Use this as a scratch pad for quick experiments. It runs from a temp
            file, so you do not need to open a folder or create a project first.
          </p>
        </div>

        <div className="practice-controls">
          <label htmlFor="practice-language">Language</label>
          <select
            id="practice-language"
            value={language}
            onChange={(event) => {
              stopVisibleRun();
              const nextLanguage = event.target.value as PracticeLanguage;
              setLanguage(nextLanguage);
              setCode(STARTER_CODE[nextLanguage]);
              setInput(STARTER_INPUT[nextLanguage]);
              setResult(null);
              onResult(null);
            }}
          >
            <option value="svans">SVANS</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="powershell">PowerShell</option>
          </select>
        </div>
      </section>

      <section className="practice-workbench">
        <div className="practice-editor-card">
          <div className="training-panel-label">Practice Code</div>
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            aria-label="Practice code editor"
          />
        </div>

        <div className="practice-output-card">
          <div className="training-panel-label">
            Output {result ? `· Exit ${result.exitCode ?? "unknown"}` : ""}
          </div>
          <pre className={result && !result.ok ? "practice-output-error" : ""}>
            {output}
          </pre>
        </div>

        <div className="practice-input-card">
          <div className="training-panel-label">Program Input</div>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            placeholder="Each line here is sent to input(), stdin, or Read-Host when you run."
            aria-label="Practice program input"
          />
        </div>

        <div className="practice-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => void runPractice()}
            disabled={running}
          >
            {running ? "Running..." : "Run Practice"}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              stopVisibleRun();
              setCode(STARTER_CODE[language]);
              setInput(STARTER_INPUT[language]);
              setResult(null);
              onResult(null);
              onStatus("Practice reset.");
            }}
          >
            Reset Starter
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              stopVisibleRun();
              setCode("");
              setInput("");
              setResult(null);
              onResult(null);
              onStatus("Practice cleared.");
            }}
          >
            Clear
          </button>
        </div>

        <div className="practice-command">
          <span>Last command</span>
          <code>{result?.command ?? "No practice command has run yet."}</code>
        </div>
      </section>
    </div>
  );
}
