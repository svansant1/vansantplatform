export {};

declare global {
  type ScanStatus = "good" | "warning" | "problem";
  type HealthState =
    | "detected"
    | "healthy"
    | "degraded"
    | "failed"
    | "unknown"
    | "not_tested";

  type ScanEvidence = {
    source: string;
    signal: string;
    value?: string | number | boolean | null;
    observedAt: string;
  };

  type ScanFinding = {
    category: string;
    item: string;
    status: "good" | "warning" | "problem";
    health?: HealthState;
    confidence?: number;
    detector?: string;
    evidence?: ScanEvidence[];
    detail: string;
    fix: string;
  };

  type ScanResult = {
    scope: "apps" | "network" | "files" | "sites";
    summary: string;
    findings: ScanFinding[];
    logs: string[];
    recommendations: string[];
    scannedAt: string;
    meta?: Record<string, unknown>;
  };

  type SaveReportResult = {
    ok: boolean;
    filePath?: string;
    error?: string;
  };

  interface Window {
    scanner: {
      apps: () => Promise<ScanResult>;
      network: () => Promise<ScanResult>;
      files: (dir?: string) => Promise<ScanResult>;
      sites: (sessionCode: string, deviceToken: string) => Promise<ScanResult>;
      pickFolder: () => Promise<string | null>;
      saveReport: (content: string, defaultName: string) => Promise<SaveReportResult>;
    };
  }
}
