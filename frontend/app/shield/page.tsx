"use client";

import { useEffect, useState } from "react";

type QuickTarget = {
  label: string;
  path: string;
};

type ShieldFinding = {
  name: string;
  path: string;
  extension: string;
  score: number;
  risk: string;
  reasons: string[];
  sha256: string;
};

export default function ShieldPage() {
  const [quickTargets, setQuickTargets] = useState<QuickTarget[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [findings, setFindings] = useState<ShieldFinding[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  useEffect(() => {
    const loadQuickTargets = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/shield/quick-targets");
        const data = await res.json();

        if (data.ok) {
          setQuickTargets(data.targets || []);
        }
      } catch {
        setStatus("Could not load quick scan targets.");
      }
    };

    loadQuickTargets();
  }, []);

  const runScan = async (targetPath?: string) => {
    const scanPath = targetPath || folderPath.trim();

    if (!scanPath) {
      setStatus("Enter a folder path or choose a quick scan target.");
      return;
    }

    setLoading(true);
    setStatus("Scanning...");
    setFindings([]);

    try {
      const res = await fetch("http://127.0.0.1:8000/shield/scan-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folder_path: scanPath,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setFindings(data.findings || []);
        setScannedCount(data.scanned_count || 0);
        setStatus(
          `Scan complete. Scanned ${data.scanned_count} file(s), found ${data.finding_count} suspicious item(s).`,
        );
      } else {
        setStatus(data.error || "Scan failed.");
      }
    } catch {
      setStatus("Could not connect to shield scan service.");
    }

    setLoading(false);
  };

  const runScanAll = async () => {
    setLoading(true);
    setStatus("Running full quick scan...");
    setFindings([]);

    try {
      const res = await fetch("http://127.0.0.1:8000/shield/scan-all");
      const data = await res.json();

      if (data.ok) {
        setFindings(data.findings || []);
        setScannedCount(data.scanned_count || 0);
        setStatus(
          `Full quick scan complete. Scanned ${data.scanned_count} file(s) across ${data.scanned_targets.length} target(s), found ${data.finding_count} suspicious item(s).`,
        );
      } else {
        setStatus(data.error || "Full scan failed.");
      }
    } catch {
      setStatus("Could not connect to shield full scan service.");
    }

    setLoading(false);
  };

  const quarantineFinding = async (filePath: string) => {
    try {
      const res = await fetch("http://127.0.0.1:8000/shield/quarantine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_path: filePath,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setStatus(`Quarantined: ${data.original_path}`);
        setFindings((prev) => prev.filter((item) => item.path !== filePath));
      } else {
        setStatus(data.error || "Failed to quarantine file.");
      }
    } catch {
      setStatus("Could not connect to shield quarantine service.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vansant Shield</h1>
        <p className="mt-2 text-zinc-400">
          Scan folders for suspicious files, review findings, and quarantine
          risky items.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold text-white">Quick Scan</h2>
        <div className="flex flex-wrap gap-3">
          {quickTargets.map((target) => (
            <button
              key={target.path}
              onClick={() => runScan(target.path)}
              className="rounded-xl bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600"
            >
              Scan {target.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-lg font-semibold text-white">
            Custom Folder Scan
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="Enter folder path..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
            />
            <button
              onClick={() => runScan()}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-medium text-white hover:bg-orange-600"
            >
              Scan
            </button>
            <button
              onClick={runScanAll}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
            >
              Scan All
            </button>
          </div>
        </div>

        {status && <p className="mt-4 text-sm text-green-400">{status}</p>}
        {loading && <p className="mt-2 text-sm text-zinc-400">Scanning...</p>}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Findings</h2>
          <p className="text-sm text-zinc-400">
            Files scanned: {scannedCount} | Suspicious: {findings.length}
          </p>
        </div>

        {findings.length === 0 ? (
          <p className="text-zinc-400">
            No suspicious findings yet. Run a scan to begin.
          </p>
        ) : (
          <div className="space-y-4">
            {findings.map((finding) => (
              <div
                key={finding.path}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-white">{finding.name}</h3>
                    <p className="text-sm text-zinc-400 break-all">
                      {finding.path}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-zinc-300">
                      Risk:{" "}
                      <span className="font-semibold uppercase">
                        {finding.risk}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-400">
                      Score: {finding.score}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-sm text-zinc-300">
                    Extension: {finding.extension}
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">Reasons:</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-zinc-400">
                    {finding.reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3">
                  <p className="text-xs text-zinc-500 break-all">
                    SHA-256: {finding.sha256}
                  </p>
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => quarantineFinding(finding.path)}
                    className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                  >
                    Quarantine
                  </button>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={runScanAll}
                    className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                  >
                    Scan All
                  </button>

                  {quickTargets.map((target) => (
                    <button
                      key={target.path}
                      onClick={() => runScan(target.path)}
                      className="rounded-xl bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600"
                    >
                      Scan {target.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
