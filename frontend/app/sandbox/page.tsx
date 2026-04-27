"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://vansant-backend.onrender.com";

const lessons = [
  {
    title: "Print",
    code: `print("Hello, SVANSAI Sandbox")`,
    input: "",
  },
  {
    title: "Variables",
    code: `name = "Shawn"\nage = 35\nprint(name)\nprint(age)`,
    input: "",
  },
  {
    title: "Input",
    code: `name = input("Enter your name: ")\nprint("Hello", name)`,
    input: "Shawn",
  },
  {
    title: "If Statement",
    code: `score = 85\nif score >= 70:\n    print("Pass")\nelse:\n    print("Try again")`,
    input: "",
  },
  {
    title: "Loop",
    code: `for i in range(1, 6):\n    print("Round", i)`,
    input: "",
  },
  {
    title: "Function",
    code: `def add(a, b):\n    return a + b\n\nprint(add(10, 5))`,
    input: "",
  },
];

export default function SandboxPage() {
  const [code, setCode] = useState(lessons[0].code);
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState("Terminal ready.");
  const [loading, setLoading] = useState(false);

  async function runCode() {
    setLoading(true);
    setOutput("Running...");

    try {
      const res = await fetch(`${API_BASE_URL}/sandbox/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, input: stdin }),
      });

      const data = await res.json();
      setOutput(data.output || "No output.");
    } catch {
      setOutput("Error running code. Check backend connection.");
    } finally {
      setLoading(false);
    }
  }

  function loadLesson(index: number) {
    setCode(lessons[index].code);
    setStdin(lessons[index].input);
    setOutput(`Loaded lesson: ${lessons[index].title}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Python Sandbox</h1>
        <p className="mt-2 text-zinc-400">
          Practice Python with code execution, input support, and terminal
          output.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={runCode}
          disabled={loading}
          className="rounded-xl bg-green-500 px-5 py-3 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Code"}
        </button>

        <button
          onClick={() => {
            setCode("");
            setStdin("");
            setOutput("Terminal cleared.");
          }}
          className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-900"
        >
          Reset
        </button>

        <a
          href="/downloads/Vansant-Sandbox.exe"
          download
          className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-600"
        >
          Download Desktop Sandbox
        </a>

        <Link
          href="/dashboard"
          className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-900"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-3 text-lg font-semibold text-white">Lessons</h2>

          <div className="space-y-2">
            {lessons.map((lesson, index) => (
              <button
                key={lesson.title}
                onClick={() => loadLesson(index)}
                className="w-full rounded-xl border border-zinc-800 px-4 py-3 text-left text-sm text-zinc-200 hover:border-purple-500 hover:bg-zinc-900"
              >
                {lesson.title}
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-purple-400">
              Python Editor
            </div>

            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
              className="h-80 w-full resize-y rounded-xl border border-zinc-800 bg-black p-4 font-mono text-sm text-green-300 outline-none focus:border-purple-500"
            />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-orange-400">
              Program Input
            </div>

            <textarea
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
              placeholder="Input for input() goes here. Example: Shawn"
              spellCheck={false}
              className="h-24 w-full resize-y rounded-xl border border-zinc-800 bg-black p-4 font-mono text-sm text-yellow-300 outline-none focus:border-orange-500"
            />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-black p-4">
            <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-green-400">
              Terminal Output
            </div>

            <pre className="min-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black font-mono text-sm text-green-300">
              {output}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
