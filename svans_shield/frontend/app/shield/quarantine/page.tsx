"use client";

import { useEffect } from "react";
import {
  type QuarantineRecord,
  type RiskLevel,
  useShield,
} from "../../components/shield/ShieldProvider";

export default function QuarantinePage() {
  const {
    quarantineRecords,
    loadQuarantineHistory,
    restoreQuarantineRecord,
    loading,
  } = useShield();

  useEffect(() => {
    void loadQuarantineHistory();
  }, [loadQuarantineHistory]);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-900/50 via-zinc-950 to-orange-950/40 p-6 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-purple-300">
          Isolation Vault
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight">Quarantine</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
          Files moved out of active locations are tracked here with their
          original path, quarantine path, hash, verdict, and timestamp.
        </p>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h3 className="text-xl font-bold">Quarantine History</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {quarantineRecords.length.toLocaleString()} record
              {quarantineRecords.length === 1 ? "" : "s"} stored locally.
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadQuarantineHistory()}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold transition hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {quarantineRecords.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/30 p-10 text-center">
            <p className="text-zinc-400">No quarantined files yet.</p>
            <p className="mt-2 text-sm text-zinc-600">
              Files quarantined from Findings will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[1fr_0.34fr_0.28fr] gap-4 border-b border-white/10 bg-black/40 px-5 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500 xl:grid">
              <span>File</span>
              <span>Verdict</span>
              <span>Quarantined</span>
            </div>

            <div className="divide-y divide-white/10">
              {quarantineRecords.map((record) => (
                <QuarantineRow
                  key={record.id}
                  record={record}
                  disabled={loading}
                  onRestore={() => restoreQuarantineRecord(record.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function QuarantineRow({
  record,
  disabled,
  onRestore,
}: {
  record: QuarantineRecord;
  disabled: boolean;
  onRestore: () => void;
}) {
  const quarantinedAt = record.quarantined_at
    ? new Date(record.quarantined_at).toLocaleString()
    : "Unknown";
  const restoredAt = record.restored_at
    ? new Date(record.restored_at).toLocaleString()
    : "";
  const isRestored = Boolean(record.restored_at);

  return (
    <article className="grid gap-4 bg-black/20 px-5 py-5 xl:grid-cols-[1fr_0.34fr_0.28fr] xl:items-start">
      <div className="min-w-0">
        <p className="break-words font-semibold text-white">{record.name}</p>
        <p className="mt-1 break-all text-xs text-zinc-500">
          Original: {record.original_path}
        </p>
        <p className="mt-1 break-all text-xs text-zinc-500">
          Quarantine: {record.quarantine_path}
        </p>
        {record.restored_path && (
          <p className="mt-1 break-all text-xs text-emerald-300/80">
            Restored: {record.restored_path}
          </p>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-purple-300">
            Technical Details
          </summary>
          <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-950 p-4">
            <p className="break-all font-mono text-[11px] text-zinc-500">
              SHA-256: {record.sha256}
            </p>
            {record.explanation && (
              <p className="mt-3 text-xs leading-5 text-zinc-300">
                {record.explanation}
              </p>
            )}
            {record.reasons.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                {record.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-zinc-300">
          {record.verdict || "Quarantined"}
        </p>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${riskBadgeClass(
            record.risk,
          )}`}
        >
          {record.risk}
        </span>
        <p className="text-xs text-zinc-500">Score: {record.score}</p>
        {isRestored ? (
          <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase text-emerald-200">
            Restored
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={onRestore}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Restore
          </button>
        )}
      </div>

      <div className="space-y-2 text-sm text-zinc-400">
        <p>{quarantinedAt}</p>
        {restoredAt && <p className="text-emerald-300">Restored {restoredAt}</p>}
      </div>
    </article>
  );
}

function riskBadgeClass(risk: RiskLevel) {
  switch (risk) {
    case "critical":
      return "border-red-400/60 bg-red-500/15 text-red-200";
    case "high":
      return "border-red-500/50 bg-red-500/10 text-red-300";
    case "medium":
      return "border-orange-500/50 bg-orange-500/10 text-orange-300";
    case "low":
      return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
    default:
      return "border-zinc-700 bg-zinc-800 text-zinc-300";
  }
}
