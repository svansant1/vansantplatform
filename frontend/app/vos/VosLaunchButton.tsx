"use client";

import { useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { usePairing } from "../../hooks/usePairing";

export function VosLaunchButton() {
  const { pairing, status, isCreating, createPairCode } = usePairing();
  const [attempted, setAttempted] = useState(false);

  async function openVos() {
    setAttempted(false);
    const result = await createPairCode();
    if (!result.ok || !result.code) return;

    setAttempted(true);
    window.location.href = "vansantos://launch";
  }

  const connected = Boolean(status?.connected);
  const error = status?.ok === false ? status.error : undefined;

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={openVos}
        disabled={isCreating}
        className="inline-flex items-center gap-3 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-6 py-4 font-bold text-cyan-100 transition hover:-translate-y-0.5 hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-wait disabled:opacity-60"
      >
        {isCreating ? <LoaderCircle className="animate-spin" size={21} aria-hidden="true" /> : <ExternalLink size={21} aria-hidden="true" />}
        {isCreating ? "Creating secure code…" : "Open VOS"}
      </button>

      {pairing?.code && (
        <p className="max-w-sm text-xs leading-5 text-zinc-400" role="status">
          Pair code <strong className="tracking-[0.18em] text-cyan-200">{pairing.code}</strong>
          {connected ? " confirmed. VOS is connected." : " created. Open VOS, then enter this code on its lock screen."}
        </p>
      )}
      {error && <p className="max-w-sm text-xs text-rose-300" role="alert">{error}</p>}
      {attempted && !connected && (
        <p className="max-w-sm text-xs text-zinc-500">
          Approve the browser prompt. If no lock screen opens, install VOS once and try again.
        </p>
      )}
    </div>
  );
}
