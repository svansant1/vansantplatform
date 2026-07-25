"use client";

import { LoaderCircle, MonitorPlay } from "lucide-react";
import { usePairing } from "../../hooks/usePairing";

type VosOnlineLaunchButtonProps = {
  label?: string;
  app?: string;
};

export function VosOnlineLaunchButton({
  label = "Explore VOS Online",
  app,
}: VosOnlineLaunchButtonProps) {
  const { pairing, status, isCreating, createPairCode } = usePairing();
  const previewUrl = `/vos/online${app ? `#${encodeURIComponent(app)}` : ""}`;

  async function launchPreview() {
    await createPairCode();
  }

  const connected = Boolean(status?.connected);
  const error = status?.ok === false ? status.error : undefined;

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={launchPreview}
        disabled={isCreating}
        className="inline-flex items-center gap-3 rounded-2xl bg-white px-6 py-4 font-bold text-[#080b16] shadow-[0_0_40px_rgba(255,255,255,0.12)] transition hover:-translate-y-0.5 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-wait disabled:opacity-60"
      >
        {isCreating ? (
          <LoaderCircle className="animate-spin" size={21} aria-hidden="true" />
        ) : (
          <MonitorPlay size={21} aria-hidden="true" />
        )}
        {isCreating
          ? "Creating preview code…"
          : pairing?.code
            ? "Create another code"
            : label}
      </button>

      {pairing?.code && (
        <div
          className="w-full max-w-md rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
          role="status"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
            Your one-time preview code
          </p>
          <p className="mt-2 select-all font-mono text-2xl font-black tracking-[0.24em] text-white">
            {pairing.code}
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            {connected
              ? "Code confirmed. Your online preview is connected."
              : "Keep this page available, open the preview, and enter this code on its lock screen."}
          </p>
          {!connected && (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-3 text-xs font-bold text-white transition hover:brightness-110"
              >
                Open preview in a new tab
              </a>
              <a
                href={previewUrl}
                className="rounded-xl border border-white/15 px-4 py-3 text-xs font-bold text-white transition hover:bg-white/10"
              >
                Open in this tab
              </a>
            </div>
          )}
          {!connected && (
            <p className="mt-3 text-[11px] leading-4 text-amber-200/80">
              If your work browser blocks new tabs, use “Open in this tab.”
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="max-w-sm text-xs text-rose-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
