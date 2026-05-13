"use client";

import { useEffect, useState } from "react";
import { useShield } from "../../components/shield/ShieldProvider";

export default function ScanPage() {
  const {
    quickTargets,
    loadQuickTargets,
    runScan,
    runScanAll,
    status,
    loading,
    scanLabel,
    scanElapsedSeconds,
    lastScanDurationSeconds,
    cancelScan,
    scannedCount,
    skippedCount,
    findings,
    scannedTargets,
  } = useShield();

  const [folderPath, setFolderPath] = useState("");

  useEffect(() => {
    void loadQuickTargets();
  }, [loadQuickTargets]);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-900/50 via-zinc-950 to-orange-950/40 p-6 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-purple-300">
          Scan Center
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight">Run Scan</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
          Scan common user-level locations or enter a custom folder path.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Files Scanned" value={scannedCount} />
        <Metric label="Needs Review" value={findings.length} />
        <Metric label="Skipped" value={skippedCount} />
        <Metric
          label="Scan Time"
          value={
            loading
              ? `${scanElapsedSeconds}s`
              : lastScanDurationSeconds !== null
                ? `${lastScanDurationSeconds}s`
                : "Ready"
          }
        />
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">Quick Scan</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Recommended for normal use.
            </p>
          </div>

          <div className="flex gap-3">
            {loading && (
              <button
                type="button"
                onClick={cancelScan}
                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-200 transition hover:bg-red-500/20"
              >
                Cancel
              </button>
            )}

            <button
              disabled={loading}
              onClick={runScanAll}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold transition hover:bg-red-500 disabled:opacity-50"
            >
              Scan All
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {quickTargets.map((target) => (
            <button
              key={target.path}
              disabled={loading}
              onClick={() => runScan(target.path)}
              className="rounded-2xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-semibold text-purple-100 transition hover:bg-purple-500/20 disabled:opacity-50"
            >
              Scan {target.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            value={folderPath}
            onChange={(event) => setFolderPath(event.target.value)}
            placeholder="Example: C:\\Users\\YourName\\Downloads"
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm outline-none transition focus:border-purple-500"
          />
          <button
            disabled={loading}
            onClick={() => runScan(folderPath)}
            className="rounded-2xl bg-orange-600 px-8 py-4 text-sm font-bold transition hover:bg-orange-500 disabled:opacity-50"
          >
            Scan
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-xl">
        <h3 className="text-xl font-bold">Status</h3>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
          {loading && scanLabel && (
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-purple-300">
              Active scan: {scanLabel} · {scanElapsedSeconds}s elapsed
            </p>
          )}
          <p className="text-sm leading-6 text-zinc-300">{status}</p>
          {loading && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-purple-500" />
            </div>
          )}
        </div>
      </section>
      {scannedTargets.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            Locations Scanned
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scannedTargets.map((target) => (
              <span
                key={target}
                className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200"
              >
                {target}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
