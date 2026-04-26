"use client";

import { useEffect, useMemo, useState } from "react";
import { usePairing } from "../../hooks/usePairing";
import { connectDebugger } from "../../services/pairingService";

export default function DebuggerPage() {
  const { pairing, status, isCreating, createPairCode } = usePairing();

  const [deviceName, setDeviceName] = useState("Shawn-PC");
  const [connectMessage, setConnectMessage] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (status?.connected && status.device_name) {
      setConnectMessage(`Connected to ${status.device_name}`);
    }
  }, [status?.connected, status?.device_name]);

  const connectionText = useMemo(() => {
    if (status?.connected) return "Connected";
    if (status?.error) return status.error;
    if (pairing?.code) return "Waiting for debugger app connection...";
    return "Not connected";
  }, [pairing?.code, status?.connected, status?.error]);

  const handleConnectDebugger = async () => {
    if (!pairing?.code) {
      setConnectMessage("Generate a pair code first.");
      return;
    }

    if (!deviceName.trim()) {
      setConnectMessage("Enter a device name first.");
      return;
    }

    setIsConnecting(true);
    setConnectMessage("");

    try {
      const result = await connectDebugger(pairing.code, deviceName.trim());

      if (result.ok) {
        setConnectMessage(
          result.message ||
            `Debugger connected as ${result.device_name || deviceName}`,
        );
      } else {
        setConnectMessage(result.error || "Failed to connect debugger.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const formattedExpiry = useMemo(() => {
    if (!pairing?.expires_at) return "—";

    const date = new Date(pairing.expires_at);

    if (Number.isNaN(date.getTime())) return pairing.expires_at;

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }, [pairing?.expires_at]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">SVANSAI Debugger</h1>
        <p className="mt-2 text-zinc-400">
          Download the desktop debugger app, generate a pair code here, and use
          the app for all scans, findings, and guided fixes.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-white">
            Download Debugger App
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            The desktop app handles Apps, Network, Files, Sites, and Guided Fix
            Chat. The platform now only manages access and session pairing.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/downloads/SVANSAI-Debugger-Agent.exe"
              download
              className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-medium text-white hover:bg-purple-600"
            >
              Download Installer
            </a>

            <a
              href="/downloads/SVANSAI-Debugger-Agent-Portable.exe"
              download
              className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
            >
              Download Portable
            </a>

            <button
              onClick={createPairCode}
              disabled={isCreating}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {isCreating ? "Generating..." : "Generate Pair Code"}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Pair Code</p>
            <p className="mt-2 text-4xl font-bold tracking-[0.3em] text-white">
              {pairing?.code || "------"}
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-zinc-400">Expires At</p>
                <p className="mt-1 text-sm text-zinc-300">{formattedExpiry}</p>
              </div>

              <div>
                <p className="text-sm text-zinc-400">Status</p>
                <p className="mt-1 text-sm text-zinc-300">{connectionText}</p>
              </div>

              <div>
                <p className="text-sm text-zinc-400">Connected Device</p>
                <p className="mt-1 text-sm text-zinc-300">
                  {status?.device_name || "—"}
                </p>
              </div>

              <div>
                <p className="text-sm text-zinc-400">Used</p>
                <p className="mt-1 text-sm text-zinc-300">
                  {status?.used ? "Yes" : "No"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Manual Connect</p>

            <div className="mt-3 flex flex-col gap-3">
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Enter local device name..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />

              <button
                onClick={handleConnectDebugger}
                disabled={isConnecting || !pairing?.code}
                className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect Debugger"}
              </button>

              <p className="text-sm text-zinc-400">
                {connectMessage ||
                  "Use this only if you want to simulate or complete connection from the platform UI."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-white">How It Works</h2>

          <div className="mt-4 space-y-3 text-sm text-zinc-300">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              1. Download the desktop debugger app
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              2. Generate a pair code here
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              3. Enter the code in the desktop app
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              4. Run all scans, findings, and guided fix workflows in the app
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Backend Split</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <div>• Platform backend: pair code + connect flow</div>
              <div>• SVANSAI backend: guided fix chat + sites bridge</div>
              <div>• Desktop app: scans + findings + fix workflows</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Ready Check</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <div>
                Pair Code:{" "}
                <span className="text-white">
                  {pairing?.code ? "Ready" : "Missing"}
                </span>
              </div>
              <div>
                Session:{" "}
                <span className="text-white">
                  {status?.connected ? "Connected" : "Not Connected"}
                </span>
              </div>
              <div>
                Desktop App: <span className="text-white">Required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
