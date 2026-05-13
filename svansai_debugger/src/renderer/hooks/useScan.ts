import { useEffect, useMemo, useRef, useState } from "react";
import type { ScanMode } from "../../shared/types/scan";

const HISTORY_STORAGE_KEY = "svansai_scan_history";
const MAX_HISTORY = 20;

export type ScanHistoryEntry = {
  id: string;
  scope: ScanResult["scope"];
  summary: string;
  scannedAt: string;
  problemCount: number;
  warningCount: number;
  findings: ScanFinding[];
  logs: string[];
  recommendations: string[];
};

type SetString = (s: string) => void;

type Params = {
  connected: boolean;
  selectedMode: ScanMode;
  setStatusText: SetString;
  setCaseNotes: SetString;
  setActiveSummary: SetString;
  setLogs: (logs: string[]) => void;
  setRecommendations: (recs: string[]) => void;
  onScanComplete: (firstIssue: ScanFinding | null) => void;
};

function loadHistoryFromStorage(): ScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScanHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistoryToStorage(history: ScanHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

function buildReportText(entry: ScanHistoryEntry): string {
  const goodCount = entry.findings.filter((f) => f.status === "good").length;
  const lines: string[] = [
    `SVANSAI Debugger — Scan Report`,
    `Mode: ${entry.scope.toUpperCase()}`,
    `Date: ${new Date(entry.scannedAt).toLocaleString()}`,
    `Summary: ${entry.summary}`,
    `Counts: ${goodCount} good, ${entry.warningCount} warning, ${entry.problemCount} problem`,
    "",
    "=== FINDINGS ===",
  ];

  for (const finding of entry.findings) {
    lines.push(
      `[${finding.status.toUpperCase()}] ${finding.item} (${finding.category})`,
    );
    lines.push(`  Detail: ${finding.detail}`);
    if (finding.fix && finding.fix !== "No action needed.") {
      lines.push(`  Fix: ${finding.fix}`);
    }
    lines.push("");
  }

  lines.push("=== RECOMMENDATIONS ===");
  if (entry.recommendations.length === 0) {
    lines.push("No recommendations available.");
  }
  for (const rec of entry.recommendations) {
    lines.push(`- ${rec}`);
  }

  lines.push("");
  lines.push("=== LOGS ===");
  if (entry.logs.length === 0) {
    lines.push("No logs available.");
  }
  for (const log of entry.logs) {
    lines.push(log);
  }

  return lines.join("\n");
}

export function useScan({
  connected,
  selectedMode,
  setStatusText,
  setCaseNotes,
  setActiveSummary,
  setLogs,
  setRecommendations,
  onScanComplete,
}: Params) {
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [filesTarget, setFilesTarget] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [activeHistoryEntry, setActiveHistoryEntry] =
    useState<ScanHistoryEntry | null>(null);
  const [currentScanEntry, setCurrentScanEntry] =
    useState<ScanHistoryEntry | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanLabel, setActiveScanLabel] = useState("");
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);
  const scanRunRef = useRef(0);
  const scanStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    setScanHistory(loadHistoryFromStorage());
  }, []);

  useEffect(() => {
    if (!isScanning) return undefined;

    const timer = window.setInterval(() => {
      if (!scanStartedAtRef.current) return;
      setScanElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - scanStartedAtRef.current) / 1000)),
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isScanning]);

  const goodCount = useMemo(
    () => findings.filter((f) => f.status === "good").length,
    [findings],
  );
  const warningCount = useMemo(
    () => findings.filter((f) => f.status === "warning").length,
    [findings],
  );
  const problemCount = useMemo(
    () => findings.filter((f) => f.status === "problem").length,
    [findings],
  );

  const handlePickFolder = async () => {
    const picked = await window.scanner.pickFolder();
    if (picked) setFilesTarget(picked);
  };

  const handleStartScan = async () => {
    if (!connected) {
      setStatusText("Connect with a valid session code before scanning.");
      setCaseNotes("Connect with a valid session code before running diagnostics.");
      return;
    }

    if (isScanning) {
      setStatusText("A scan is already running. Wait for it to finish first.");
      return;
    }

    const runId = scanRunRef.current + 1;
    scanRunRef.current = runId;
    scanStartedAtRef.current = Date.now();
    setIsScanning(true);
    setActiveScanLabel(selectedMode);
    setScanElapsedSeconds(0);
    setActiveHistoryEntry(null);
    setStatusText(`Running ${selectedMode} scan...`);
    setCaseNotes(
      `Running ${selectedMode} diagnostics. Results will update when the scan completes.`,
    );

    try {
      let result: ScanResult;

      switch (selectedMode) {
        case "apps":
          result = await window.scanner.apps();
          break;
        case "network":
          result = await window.scanner.network();
          break;
        case "files":
          result = await window.scanner.files(filesTarget || undefined);
          break;
        case "sites":
          result = await window.scanner.sites();
          break;
        default:
          selectedMode satisfies never;
          return;
      }

      if (scanRunRef.current !== runId) {
        return;
      }

      setFindings(result.findings);
      setActiveSummary(result.summary);
      setLogs(result.logs);
      setRecommendations(result.recommendations);
      setCaseNotes(
        `Scan completed at ${new Date(result.scannedAt).toLocaleString()}. Review findings, logs, and recommendations below.`,
      );
      setStatusText("Scan complete.");

      // Save to history
      const problems = result.findings.filter(
        (f) => f.status === "problem",
      ).length;
      const warnings = result.findings.filter(
        (f) => f.status === "warning",
      ).length;

      const entry: ScanHistoryEntry = {
        id: `${result.scope}-${result.scannedAt}`,
        scope: result.scope,
        summary: result.summary,
        scannedAt: result.scannedAt,
        problemCount: problems,
        warningCount: warnings,
        findings: result.findings,
        logs: result.logs,
        recommendations: result.recommendations,
      };

      setCurrentScanEntry(entry);
      setScanHistory((prev) => {
        const next = [entry, ...prev].slice(0, MAX_HISTORY);
        saveHistoryToStorage(next);
        return next;
      });

      const firstIssue =
        result.findings.find((f) => f.status !== "good") ??
        result.findings[0] ??
        null;

      onScanComplete(firstIssue);
    } catch (error) {
      if (scanRunRef.current !== runId) {
        return;
      }

      setStatusText(
        error instanceof Error ? `Scan failed: ${error.message}` : "Scan failed.",
      );
      setCaseNotes("The scan failed before results could be generated.");
    } finally {
      if (scanRunRef.current === runId) {
        setIsScanning(false);
        setActiveScanLabel("");
        scanStartedAtRef.current = null;
      }
    }
  };

  const loadHistoryEntry = (entry: ScanHistoryEntry) => {
    setActiveHistoryEntry(entry);
    setFindings(entry.findings);
    setActiveSummary(entry.summary);
    setLogs(entry.logs);
    setRecommendations(entry.recommendations);
    setCaseNotes(
      `Viewing historical scan from ${new Date(entry.scannedAt).toLocaleString()}.`,
    );
    setStatusText(`Loaded ${entry.scope} scan from history.`);
  };

  const exportResults = async () => {
    const entryToExport = activeHistoryEntry ?? currentScanEntry;

    if (!entryToExport || entryToExport.findings.length === 0) {
      setStatusText("No findings to export. Run a scan first.");
      return;
    }

    const content = buildReportText(entryToExport);
    const timestamp = new Date(entryToExport.scannedAt)
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const defaultName = `svansai-scan-${entryToExport.scope}-${timestamp}.txt`;

    try {
      const result = await window.scanner.saveReport(content, defaultName);
      if (result.ok) {
        setStatusText(`Report saved: ${result.filePath ?? "success"}`);
      } else {
        setStatusText("Export cancelled or failed.");
      }
    } catch {
      setStatusText("Export failed.");
    }
  };

  return {
    findings,
    filesTarget,
    setFilesTarget,
    goodCount,
    warningCount,
    problemCount,
    scanHistory,
    activeHistoryEntry,
    isScanning,
    activeScanLabel,
    scanElapsedSeconds,
    handlePickFolder,
    handleStartScan,
    loadHistoryEntry,
    exportResults,
  };
}
