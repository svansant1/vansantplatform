"use client";

import { useEffect } from "react";
import { useLiveLogs } from "../../hooks/useLiveLogs";

export default function DebugOverlayPage() {
  const { messages, isConnected, connect, disconnect, clearMessages } =
    useLiveLogs();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="min-h-screen bg-zinc-950/90 p-4 text-white">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">SVANSAI Debug Overlay</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Live system intelligence stream from the active VansantPlatform
              backend websocket.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={connect}
              className="rounded-lg bg-purple-500 px-3 py-2 text-sm text-white hover:bg-purple-600"
            >
              Connect
            </button>
            <button
              onClick={disconnect}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
            >
              Disconnect
            </button>
            <button
              onClick={clearMessages}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <span className="text-zinc-400">Channel Status:</span>{" "}
          <span className={isConnected ? "text-green-400" : "text-zinc-300"}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <div className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-zinc-800 bg-black p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No overlay messages received yet.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div
                  key={`overlay-${index}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                      <div className="text-xs text-zinc-500">CPU Usage</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {typeof message.cpu_usage === "number"
                          ? `${message.cpu_usage}%`
                          : "—"}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                      <div className="text-xs text-zinc-500">Memory Usage</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {typeof message.memory === "number"
                          ? `${message.memory}%`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <div className="text-xs text-zinc-500">
                      Threat / Intel Payload
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-200">
                      {JSON.stringify(message, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
