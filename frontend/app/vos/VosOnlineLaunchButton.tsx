"use client";

import { LoaderCircle, MonitorPlay } from "lucide-react";
import { useState } from "react";
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
  const [popupBlocked, setPopupBlocked] = useState(false);

  async function launchPreview() {
    setPopupBlocked(false);
    const preview = window.open("", "_blank");
    if (!preview) {
      setPopupBlocked(true);
      return;
    }

    preview.document.title = "Preparing VOS Online";
    preview.document.body.style.cssText =
      "margin:0;display:grid;place-items:center;min-height:100vh;background:#050711;color:white;font:16px Arial";
    preview.document.body.textContent = "Creating a secure VOS preview session…";

    const result = await createPairCode();
    if (!result.ok || !result.code) {
      preview.close();
      return;
    }

    preview.location.href = `/vos/online${app ? `#${encodeURIComponent(app)}` : ""}`;
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
        {isCreating ? "Creating preview code…" : label}
      </button>

      {pairing?.code && (
        <p className="max-w-sm text-xs leading-5 text-zinc-400" role="status">
          Preview code{" "}
          <strong className="tracking-[0.18em] text-cyan-200">
            {pairing.code}
          </strong>
          {connected
            ? " confirmed. VOS Online is unlocked."
            : " created. Enter it in the new VOS Online tab."}
        </p>
      )}
      {error && (
        <p className="max-w-sm text-xs text-rose-300" role="alert">
          {error}
        </p>
      )}
      {popupBlocked && (
        <p className="max-w-sm text-xs text-amber-300" role="alert">
          Allow pop-ups for Vansant Platform, then try again so the code remains
          visible while VOS Online opens.
        </p>
      )}
    </div>
  );
}
