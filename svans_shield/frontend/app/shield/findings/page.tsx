"use client";

import { useMemo, useState } from "react";
import {
  RiskLevel,
  ShieldFinding,
  useShield,
} from "../../components/shield/ShieldProvider";

const MAX_VISIBLE_FINDINGS = 150;

export default function FindingsPage() {
  const { findings, quarantineFinding, markFindingSafe, loading, scannedCount } = useShield();
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [search, setSearch] = useState("");

  const filteredFindings = useMemo(() => {
    const query = search.trim().toLowerCase();

    return findings
      .filter((finding) => riskFilter === "all" || finding.risk === riskFilter)
      .filter((finding) => {
        if (!query) return true;

        return (
          finding.name.toLowerCase().includes(query) ||
          finding.path.toLowerCase().includes(query) ||
          finding.sha256.toLowerCase().includes(query) ||
          finding.verdict?.toLowerCase().includes(query)
        );
      })
      .slice(0, MAX_VISIBLE_FINDINGS);
  }, [findings, riskFilter, search]);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-900/50 via-zinc-950 to-orange-950/40 p-6 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-purple-300">
          Threat Review
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight">Findings</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
          Review verdicts, explanations, behavior tags, hashes, and quarantine
          confirmed risky files.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Files Scanned" value={scannedCount} />
        <Metric label="Total Findings" value={findings.length} />
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
        <Metric label="Visible" value={filteredFindings.length} />
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-xl">
        <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <h3 className="text-xl font-bold">Review Queue</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Showing up to {MAX_VISIBLE_FINDINGS} filtered results.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, path, hash, or verdict..."
              className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-purple-500"
            />

            <select
              value={riskFilter}
              onChange={(event) =>
                setRiskFilter(event.target.value as "all" | RiskLevel)
              }
              className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-purple-500"
            >
              <option value="all">All Risk</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-10 text-center">
            <p className="text-zinc-400">
              No findings available. Run a scan from the Scan page.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[1.2fr_0.65fr_0.45fr_0.45fr_0.85fr] gap-4 border-b border-white/10 bg-black/40 px-5 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500 xl:grid">
              <span>File</span>
              <span>Verdict</span>
              <span>Risk</span>
              <span>Score</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-white/10">
              {filteredFindings.map((finding) => (
                <FindingRow
                  key={`${finding.path}-${finding.sha256}`}
                  finding={finding}
                  disabled={loading}
                  onQuarantine={() => quarantineFinding(finding.path)}
                  onMarkSafe={() => markFindingSafe(finding.sha256, finding.path)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function FindingRow({
  finding,
  disabled,
  onQuarantine,
  onMarkSafe,
}: {
  finding: ShieldFinding;
  disabled: boolean;
  onQuarantine: () => void;
  onMarkSafe: () => void;
}) {
  return (
    <article className="grid gap-4 bg-black/20 px-5 py-5 xl:grid-cols-[1.2fr_0.65fr_0.45fr_0.45fr_0.85fr] xl:items-center">
      <div className="min-w-0">
        <p className="break-words font-semibold text-white">{finding.name}</p>
        <p className="mt-1 break-all text-xs text-zinc-500">{finding.path}</p>

        {finding.explanation && (
          <div className="mt-3 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-purple-300">
              Analyst Explanation
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-300">
              {finding.explanation}
            </p>

            {finding.context_tags && finding.context_tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {finding.context_tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[11px] font-semibold text-purple-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-purple-300">
            Technical Details
          </summary>
          <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-400">
              Extension: {finding.extension}
            </p>
            <p className="mt-2 break-all font-mono text-[11px] text-zinc-500">
              SHA-256: {finding.sha256}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-400">
              {finding.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </details>
      </div>

      <p className="text-sm font-semibold text-zinc-300">
        {finding.verdict || "Review"}
      </p>

      <span
        className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase ${riskBadgeClass(
          finding.risk,
        )}`}
      >
        {finding.risk}
      </span>

      <p className="text-sm font-bold text-zinc-300">{finding.score}</p>

      <div className="flex flex-col gap-2">
        <button
          disabled={disabled}
          onClick={onQuarantine}
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          Quarantine
        </button>
        <button
          disabled={disabled}
          onClick={onMarkSafe}
          className="rounded-xl border border-zinc-700/60 bg-zinc-800/40 px-4 py-2 text-sm font-bold text-zinc-400 transition hover:bg-zinc-700/40 disabled:opacity-50"
        >
          Mark Safe
        </button>
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

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className={`mt-3 text-3xl font-black ${danger ? "text-red-300" : ""}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
