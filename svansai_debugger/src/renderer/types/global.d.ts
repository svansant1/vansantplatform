export {};

declare global {
  type ScanStatus = "good" | "warning" | "problem";

  type ScanFinding = {
    category: string;
    item: string;
    status: "good" | "warning" | "problem";
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
      sites: () => Promise<ScanResult>;
      pickFolder: () => Promise<string | null>;
      saveReport: (content: string, defaultName: string) => Promise<SaveReportResult>;
    };
  }
}
