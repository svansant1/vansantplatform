"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useShield } from "../components/shield/ShieldProvider";

export default function ShieldDashboardPage() {
  const {
    findings,
    scannedCount,
    skippedCount,
    status,
    loading,
    scanLabel,
    scanElapsedSeconds,
    lastScanDurationSeconds,
  } = useShield();

  const shieldScore = useMemo(() => {
    if (findings.length === 0) return 100;

    const penalty =
      findings.filter((finding) => finding.risk === "critical").length * 20 +
      findings.filter((finding) => finding.risk === "high").length * 12 +
      findings.filter((finding) => finding.risk === "medium").length * 4 +
      findings.filter((finding) => finding.risk === "low").length;

    return Math.max(0, Math.min(100, 100 - penalty));
  }, [findings]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-900/50 via-zinc-950 to-orange-950/40 p-6 shadow-2xl">
        <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-purple-300">
              Security Dashboard
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
              SVANS Shield
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
              Local protection dashboard with scan control, intelligent finding
              analysis, quarantine review, and protection settings.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/shield/scan"
                className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-bold transition hover:bg-purple-500"
              >
                Start Scan
              </Link>
              <Link
                href="/shield/findings"
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold transition hover:bg-white/10"
              >
                View Findings
              </Link>
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-black/30 p-6 text-center shadow-inner">
            <div className="grid h-36 w-36 place-items-center rounded-full border-8 border-purple-500/40 bg-zinc-950">
              <div>
                <p className="text-4xl font-black">{shieldScore}</p>
                <p className="text-xs text-zinc-500">Shield Score</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Files Scanned" value={scannedCount} />
        <Metric label="Needs Review" value={findings.length} />
        <Metric
          label="High/Critical"
          value={
            findings.filter(
              (finding) =>
                finding.risk === "high" || finding.risk === "critical",
            ).length
          }
          danger
        />
        <Metric label="Skipped" value={skippedCount} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Metric
          label="Scan State"
          value={loading ? "Running" : "Ready"}
        />
        <Metric
          label="Scan Time"
          value={
            loading
              ? `${scanElapsedSeconds}s`
              : lastScanDurationSeconds !== null
                ? `${lastScanDurationSeconds}s`
                : 0
          }
        />
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-xl">
        <h3 className="text-xl font-bold">Current Status</h3>
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
    </div>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: number | string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className={`mt-3 text-3xl font-black ${danger ? "text-red-300" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
