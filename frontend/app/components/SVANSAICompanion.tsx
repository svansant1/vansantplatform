"use client";

import { useState } from "react";

type CompanionProps = {
  onSend: (message?: string) => void | Promise<void>;
  loading?: boolean;
};

const starterPrompts = [
  "Walk me through this step by step",
  "Help me understand this error",
  "Teach me this topic like a tutor",
  "Show me the next step",
];

export default function SVANSAICompanion({
  onSend,
  loading = false,
}: CompanionProps) {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [tutorMode, setTutorMode] = useState(true);

  const handleSend = () => {
    const finalInput = input.trim();
    if (!finalInput) return;

    const message = tutorMode
      ? `Tutor mode: guide me step by step and help me think through this instead of giving the final answer immediately.\n\n${finalInput}`
      : finalInput;

    onSend(message);
    setInput("");
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-3">
      {open && (
        <div className="w-[320px] rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                SVANSAI Companion
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                Your personal tutor guide inside VansantPlatform.
              </p>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-sm text-zinc-200">
              Hey — how can I help you today?
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              I can guide you through coding, debugging, learning topics, and
              building projects.
            </p>
          </div>

          <div className="mb-3 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-white">Tutor Mode</p>
              <p className="text-[11px] text-zinc-400">
                Guide first, answer later
              </p>
            </div>

            <button
              onClick={() => setTutorMode((prev) => !prev)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                tutorMode
                  ? "bg-purple-500 text-white"
                  : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {tutorMode ? "On" : "Off"}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() =>
                  onSend(
                    tutorMode
                      ? `Tutor mode: guide me step by step and help me think through this instead of giving the final answer immediately.\n\n${prompt}`
                      : prompt,
                  )
                }
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask your tutor..."
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
            />

            <button
              onClick={handleSend}
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-orange-400 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex h-28 w-24 flex-col items-center justify-end rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl"
      >
        <div className="absolute -top-1 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-4 border-zinc-950 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-lg" />

        <div className="absolute top-3 left-1/2 h-3 w-3 -translate-x-5 rounded-full bg-zinc-900" />
        <div className="absolute top-3 left-1/2 h-3 w-3 translate-x-2 rounded-full bg-zinc-900" />

        <div className="absolute top-7 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-zinc-800" />

        <div className="absolute -top-4 left-1/2 h-7 w-10 -translate-x-1/2 rounded-t-xl border-4 border-zinc-950 bg-gradient-to-r from-purple-500 to-orange-400" />
        <div className="absolute top-0 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-zinc-950" />

        <div className="mt-8 h-10 w-10 rounded-full bg-gradient-to-r from-purple-500 to-orange-400 opacity-20 blur-md transition-opacity group-hover:opacity-40" />

        <div className="mb-1 text-center">
          <p className="text-[11px] font-semibold text-white">SVANSAI</p>
          <p className="text-[10px] text-zinc-400">Tutor</p>
        </div>
      </button>
    </div>
  );
}
