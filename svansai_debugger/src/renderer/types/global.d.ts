export {};

declare global {
  type ScanStatus = "good" | "warning" | "problem";

  type ScanFinding = {
  category: string;
  item: string;
  status: "good" | "warning" | "problem";
  detail: string;
  fix: string; // 👈 THIS FIXES ALL 3 ERRORS
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

  interface Window {
    scanner: {
      apps: () => Promise<ScanResult>;
      network: () => Promise<ScanResult>;
      files: (dir?: string) => Promise<ScanResult>;
      sites: () => Promise<ScanResult>;
      pickFolder: () => Promise<string | null>;
    };
  }
}
