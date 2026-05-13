"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";

export type QuickTarget = {
  label: string;
  path: string;
};

export type ScanMode = "strict" | "balanced" | "deep";

export type ShieldSettings = {
  scan_mode: ScanMode;
  show_low_risk: boolean;
  auto_quarantine: boolean;
};

export type RiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

export type ShieldFinding = {
  name: string;
  path: string;
  extension: string;
  score: number;
  risk: RiskLevel;
  confidence?: "review" | "suspicious" | "critical";
  reasons: string[];
  sha256: string;
  scan_source?: string;
  verdict?: string;
  context_tags?: string[];
  explanation?: string;
};

export type QuarantineRecord = {
  id: string;
  name: string;
  original_path: string;
  quarantine_path: string;
  sha256: string;
  quarantined_at: string;
  risk: RiskLevel;
  score: number;
  verdict: string;
  reasons: string[];
  explanation?: string;
  restored_at?: string;
  restored_path?: string;
};

type ApiResponse<T> = T & {
  ok: boolean;
  error?: string;
};

type ShieldContextValue = {
  findings: ShieldFinding[];
  scannedCount: number;
  skippedCount: number;
  status: string;
  loading: boolean;
  scanLabel: string;
  scanElapsedSeconds: number;
  lastScanDurationSeconds: number | null;
  quickTargets: QuickTarget[];
  scannedTargets: string[];
  quarantineRecords: QuarantineRecord[];
  settings: ShieldSettings;
  loadQuickTargets: () => Promise<void>;
  loadQuarantineHistory: () => Promise<void>;
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<ShieldSettings>) => Promise<void>;
  markFindingSafe: (sha256: string, filePath: string) => Promise<void>;
  runScan: (folderPath: string) => Promise<void>;
  runScanAll: () => Promise<void>;
  cancelScan: () => void;
  quarantineFinding: (filePath: string) => Promise<void>;
  restoreQuarantineRecord: (recordId: string) => Promise<void>;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

const ShieldContext = createContext<ShieldContextValue | null>(null);

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data = (await response.json()) as ApiResponse<T>;

  if (!response.ok) {
    return {
      ...data,
      ok: false,
      error: data.error || `Request failed with status ${response.status}`,
    };
  }

  return data;
}

export function ShieldProvider({ children }: { children: React.ReactNode }) {
  const [findings, setFindings] = useState<ShieldFinding[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [status, setStatus] = useState("SVANS Shield is ready.");
  const [loading, setLoading] = useState(false);
  const [scanLabel, setScanLabel] = useState("");
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);
  const [lastScanDurationSeconds, setLastScanDurationSeconds] = useState<number | null>(null);
  const [quickTargets, setQuickTargets] = useState<QuickTarget[]>([]);
  const [scannedTargets, setScannedTargets] = useState<string[]>([]);
  const [quarantineRecords, setQuarantineRecords] = useState<QuarantineRecord[]>([]);
  const [settings, setSettings] = useState<ShieldSettings>({
    scan_mode: "balanced",
    show_low_risk: false,
    auto_quarantine: false,
  });
  const scanAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loading || !scanStartedAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setScanElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - scanStartedAt) / 1000)),
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [loading, scanStartedAt]);

  const loadQuickTargets = useCallback(async () => {
    try {
      const data = await apiFetch<{ targets: QuickTarget[] }>(
        "/shield/targets",
      );

      if (!data.ok) {
        setStatus(data.error || "Could not load quick scan targets.");
        return;
      }

      setQuickTargets(data.targets || []);
    } catch {
      setStatus("Could not connect to SVANS Shield service.");
    }
  }, []);

  const beginScan = useCallback((label: string) => {
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;

    setLoading(true);
    setScanLabel(label);
    setScanStartedAt(Date.now());
    setScanElapsedSeconds(0);
    setLastScanDurationSeconds(null);

    return controller;
  }, []);

  const finishScan = useCallback((controller: AbortController) => {
    if (scanAbortRef.current !== controller) return;

    scanAbortRef.current = null;
    setLoading(false);
    setScanLabel("");
    setScanStartedAt(null);
  }, []);

  const cancelScan = useCallback(() => {
    if (!scanAbortRef.current) return;

    scanAbortRef.current.abort();
    scanAbortRef.current = null;
    setLoading(false);
    setScanLabel("");
    setScanStartedAt(null);
    setStatus("Scan canceled. Previous findings are still shown.");
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiFetch<{ settings: ShieldSettings }>("/shield/settings");

      if (!data.ok) {
        setStatus(data.error || "Could not load settings.");
        return;
      }

      setSettings(data.settings);
    } catch {
      setStatus("Could not connect to shield settings service.");
    }
  }, []);

  const updateSettings = useCallback(async (updates: Partial<ShieldSettings>) => {
    try {
      const data = await apiFetch<{ settings: ShieldSettings }>("/shield/settings", {
        method: "POST",
        body: JSON.stringify(updates),
      });

      if (!data.ok) {
        setStatus(data.error || "Could not save settings.");
        return;
      }

      setSettings(data.settings);
    } catch {
      setStatus("Could not connect to shield settings service.");
    }
  }, []);

  const markFindingSafe = useCallback(async (sha256: string, filePath: string) => {
    const confirmed = window.confirm(
      "Add this file's hash to the allowlist? It will be skipped in all future scans.",
    );

    if (!confirmed) return;

    try {
      const data = await apiFetch<Record<string, never>>("/shield/allowlist", {
        method: "POST",
        body: JSON.stringify({ sha256, note: filePath }),
      });

      if (!data.ok) {
        setStatus(data.error || "Failed to add to allowlist.");
        return;
      }

      setStatus(`Marked as safe: ${filePath}`);
      setFindings((prev) => prev.filter((item) => item.sha256 !== sha256));
    } catch {
      setStatus("Could not connect to shield allowlist service.");
    }
  }, []);

  const runScan = useCallback(async (folderPath: string) => {
    const scanPath = folderPath.trim();

    if (!scanPath) {
      setStatus("Enter a folder path or choose a quick scan target.");
      return;
    }

    const controller = beginScan(scanPath);
    setStatus(`Scanning ${scanPath}. Previous findings remain visible until this scan finishes.`);
    setScannedCount(0);
    setSkippedCount(0);
    setScannedTargets([]);

    try {
      const data = await apiFetch<{
        scanned_count: number;
        skipped_count: number;
        finding_count: number;
        duration_seconds?: number;
        findings: ShieldFinding[];
      }>("/shield/scan", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ folder_path: scanPath }),
      });

      if (!data.ok) {
        setStatus(data.error || "Scan failed.");
        return;
      }

      setFindings(data.findings || []);
      setScannedCount(data.scanned_count || 0);
      setSkippedCount(data.skipped_count || 0);
      setLastScanDurationSeconds(data.duration_seconds ?? null);
      setStatus(
        `Scan complete. Scanned ${(data.scanned_count || 0).toLocaleString()} files. ${
          data.finding_count || 0
        } items need review.${
          typeof data.duration_seconds === "number"
            ? ` Finished in ${data.duration_seconds.toLocaleString()} seconds.`
            : ""
        }`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Scan canceled. Previous findings are still shown.");
      } else {
        setStatus("Could not connect to shield scan service.");
      }
    } finally {
      finishScan(controller);
    }
  }, [beginScan, finishScan]);

  const loadQuarantineHistory = useCallback(async () => {
    try {
      const data = await apiFetch<{ records: QuarantineRecord[] }>(
        "/shield/quarantine",
      );

      if (!data.ok) {
        setStatus(data.error || "Could not load quarantine history.");
        return;
      }

      setQuarantineRecords(data.records || []);
    } catch {
      setStatus("Could not connect to shield quarantine service.");
    }
  }, []);

  const runScanAll = useCallback(async () => {
    const controller = beginScan("Quick system scan");
    setStatus("Running quick system scan. Previous findings remain visible until this scan finishes.");
    setScannedCount(0);
    setSkippedCount(0);

    try {
      const data = await apiFetch<{
        scanned_targets: string[];
        scanned_count: number;
        skipped_count: number;
        finding_count: number;
        duration_seconds?: number;
        findings: ShieldFinding[];
      }>("/shield/scan-all", {
        signal: controller.signal,
      });

      if (!data.ok) {
        setStatus(data.error || "Full scan failed.");
        return;
      }

      setFindings(data.findings || []);
      setScannedCount(data.scanned_count || 0);
      setSkippedCount(data.skipped_count || 0);
      setScannedTargets(data.scanned_targets || []);
      setLastScanDurationSeconds(data.duration_seconds ?? null);
      setStatus(
        `Quick scan complete. Scanned ${(data.scanned_count || 0).toLocaleString()} files across ${
          data.scanned_targets?.length || 0
        } locations. ${data.finding_count || 0} items need review.${
          typeof data.duration_seconds === "number"
            ? ` Finished in ${data.duration_seconds.toLocaleString()} seconds.`
            : ""
        }`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Scan canceled. Previous findings are still shown.");
      } else {
        setStatus("Could not connect to shield full scan service.");
      }
    } finally {
      finishScan(controller);
    }
  }, [beginScan, finishScan]);

  const quarantineFinding = useCallback(async (filePath: string) => {
    const confirmed = window.confirm(
      "Move this file to quarantine? Only quarantine files you have reviewed.",
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const data = await apiFetch<{
        original_path: string;
        quarantine_path: string;
        record?: QuarantineRecord;
      }>("/shield/quarantine", {
        method: "POST",
        body: JSON.stringify({ file_path: filePath }),
      });

      if (!data.ok) {
        setStatus(data.error || "Failed to quarantine file.");
        return;
      }

      setStatus(`Quarantined: ${data.original_path}`);
      setFindings((prev) => prev.filter((item) => item.path !== filePath));
      if (data.record) {
        setQuarantineRecords((prev) => [data.record as QuarantineRecord, ...prev]);
      } else {
        await loadQuarantineHistory();
      }
    } catch {
      setStatus("Could not connect to shield quarantine service.");
    } finally {
      setLoading(false);
    }
  }, [loadQuarantineHistory]);

  const restoreQuarantineRecord = useCallback(async (recordId: string) => {
    const confirmed = window.confirm(
      "Restore this file to its original path? Restore is blocked if a file already exists there.",
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const data = await apiFetch<{
        restored_path: string;
        record?: QuarantineRecord;
      }>("/shield/quarantine/restore", {
        method: "POST",
        body: JSON.stringify({ record_id: recordId }),
      });

      if (!data.ok) {
        setStatus(data.error || "Failed to restore quarantined file.");
        return;
      }

      setStatus(`Restored: ${data.restored_path}`);

      if (data.record) {
        setQuarantineRecords((prev) =>
          prev.map((record) =>
            record.id === recordId ? (data.record as QuarantineRecord) : record,
          ),
        );
      } else {
        await loadQuarantineHistory();
      }
    } catch {
      setStatus("Could not connect to shield restore service.");
    } finally {
      setLoading(false);
    }
  }, [loadQuarantineHistory]);

  const value = useMemo(
    () => ({
      findings,
      scannedCount,
      skippedCount,
      status,
      loading,
      scanLabel,
      scanElapsedSeconds,
      lastScanDurationSeconds,
      quickTargets,
      scannedTargets,
      quarantineRecords,
      settings,
      loadQuickTargets,
      loadQuarantineHistory,
      loadSettings,
      updateSettings,
      markFindingSafe,
      runScan,
      runScanAll,
      cancelScan,
      quarantineFinding,
      restoreQuarantineRecord,
    }),
    [
      findings,
      scannedCount,
      skippedCount,
      status,
      loading,
      scanLabel,
      scanElapsedSeconds,
      lastScanDurationSeconds,
      quickTargets,
      scannedTargets,
      quarantineRecords,
      settings,
      loadQuickTargets,
      loadQuarantineHistory,
      loadSettings,
      updateSettings,
      markFindingSafe,
      runScan,
      runScanAll,
      cancelScan,
      quarantineFinding,
      restoreQuarantineRecord,
    ],
  );

  return (
    <ShieldContext.Provider value={value}>{children}</ShieldContext.Provider>
  );
}

export function useShield() {
  const context = useContext(ShieldContext);

  if (!context) {
    throw new Error("useShield must be used inside ShieldProvider.");
  }

  return context;
}
