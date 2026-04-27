"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://vansant-backend.onrender.com";

const WS_BASE_URL = API_BASE_URL.replace("https://", "wss://").replace(
  "http://",
  "ws://",
);

export default function SandboxPage() {
  const [code, setCode] = useState(
    `name = input("Enter your name: ")\nprint("Hello", name)`,
  );
  const [terminal, setTerminal] = useState("Terminal ready.\n");
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);

  function appendTerminal(value: string) {
    setTerminal((current) => current + value);
  }

  function runCode() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setTerminal("");
    setRunning(true);

    const socket = new WebSocket(`${WS_BASE_URL}/sandbox/ws`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ code }));
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "output" || message.type === "error") {
        appendTerminal(message.data);
      }

      if (message.type === "done") {
        appendTerminal(message.data);
        setRunning(false);
        socket.close();
      }
    };

    socket.onerror = () => {
      appendTerminal("\nTerminal connection error.\n");
      setRunning(false);
    };

    socket.onclose = () => {
      socketRef.current = null;
      setRunning(false);
    };
  }

  function sendInput() {
    if (!command.trim()) return;

    appendTerminal(command + "\n");

    if (socketRef.current && running) {
      socketRef.current.send(
        JSON.stringify({
          type: "input",
          data: command,
        }),
      );
    }

    setCommand("");
  }

  function stopCode() {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
      socketRef.current.close();
      socketRef.current = null;
    }

    setRunning(false);
    appendTerminal("\n[Stopped]\n");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Python Sandbox</h1>
        <p className="mt-2 text-zinc-400">
          Practice Python with an interactive terminal.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={runCode}
          disabled={running}
          className="rounded-xl bg-green-500 px-5 py-3 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
        >
          {running ? "Running..." : "Run Code"}
        </button>

        <button
          onClick={stopCode}
          disabled={!running}
          className="rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
        >
          Stop
        </button>

        <button
          onClick={() => {
            setCode("");
            setTerminal("Terminal cleared.\n");
            setCommand("");
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

        <div className="rounded-2xl border border-zinc-800 bg-black p-4">
          <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-green-400">
            Interactive Terminal
          </div>

          <pre className="min-h-72 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-black p-3 font-mono text-sm text-green-300">
            {terminal}
          </pre>

          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-green-400">&gt;</span>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendInput();
                }
              }}
              placeholder={
                running
                  ? "Type terminal input here..."
                  : "Run code first, then type input here."
              }
              disabled={!running}
              className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 font-mono text-sm text-green-300 outline-none focus:border-green-500 disabled:opacity-50"
            />
            <button
              onClick={sendInput}
              disabled={!running}
              className="rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
