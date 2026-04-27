"use client";

import { useState } from "react";
import Link from "next/link";

export default function SandboxPage() {
  const [code, setCode] = useState(`print("Hello, SVANSAI Sandbox")`);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const runCode = async () => {
    setLoading(true);
    setOutput("Running...\n");

    try {
      const res = await fetch(
        "https://vansant-backend.onrender.com/sandbox/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );

      const data = await res.json();
      setOutput(data.output || "No output");
    } catch {
      setOutput("Error running code");
    }

    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Python Sandbox</h1>
        <p className="text-zinc-400 mt-2">
          Practice Python with live execution and terminal output.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={runCode}
          className="bg-green-500 px-5 py-2 rounded-lg text-white"
        >
          {loading ? "Running..." : "Run Code"}
        </button>

        <a
          href="/downloads/Vansant-Sandbox.exe"
          download
          className="bg-purple-500 px-5 py-2 rounded-lg text-white"
        >
          Download Desktop Sandbox
        </a>

        <Link
          href="/dashboard"
          className="border border-zinc-700 px-5 py-2 rounded-lg text-zinc-300"
        >
          Back
        </Link>
      </div>

      {/* Code Editor */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="w-full h-64 bg-black text-green-400 p-4 font-mono rounded-lg border border-zinc-800"
      />

      {/* Terminal Output */}
      <div className="bg-black text-green-400 p-4 font-mono rounded-lg border border-zinc-800 h-64 overflow-auto">
        <pre>{output}</pre>
      </div>
    </div>
  );
}
