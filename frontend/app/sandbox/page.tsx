"use client";

import Link from "next/link";

export default function SandboxPage() {
  const handleOpen = () => {
    window.location.href = "vansantsandbox://open";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vansant Sandbox</h1>
        <p className="mt-2 text-zinc-400">
          Desktop IDE with file access, Monaco editor, and real terminal
          support.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-white">Install Sandbox</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Download and install the desktop app to open folders, edit code, and
          use PowerShell, CMD, Git Bash, or WSL.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          {/* 🔥 NEW BUTTON */}
          <button
            onClick={handleOpen}
            className="rounded-xl bg-green-500 px-5 py-3 text-sm font-medium text-white hover:bg-green-600"
          >
            Open Sandbox
          </button>

          {/* EXISTING DOWNLOAD */}
          <a
            href="/downloads/Vansant-Sandbox-Setup.exe"
            download
            className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-medium text-white hover:bg-purple-600"
          >
            Download Sandbox
          </a>

          <Link
            href="/dashboard"
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
