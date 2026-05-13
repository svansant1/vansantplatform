export type ScanMode = "network" | "sites" | "apps" | "files";
export type ScanStatus = "good" | "warning" | "problem";

export type ScanFinding = {
  category: string;
  item: string;
  status: ScanStatus;
  detail: string;
  fix: string;
};

export type ScanResultScope = "apps" | "network" | "files" | "sites";

export type ScanResult = {
  scope: ScanResultScope;
  summary: string;
  findings: ScanFinding[];
  logs: string[];
  recommendations: string[];
  scannedAt: string;
  meta?: Record<string, unknown>;
};
