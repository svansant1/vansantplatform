export type ScanMode = "network" | "sites" | "apps" | "files";
export type ScanStatus = "good" | "warning" | "problem";
export type HealthState =
  | "detected"
  | "healthy"
  | "degraded"
  | "failed"
  | "unknown"
  | "not_tested";

export type ScanEvidence = {
  source: string;
  signal: string;
  value?: string | number | boolean | null;
  observedAt: string;
};

export type ScanFinding = {
  category: string;
  item: string;
  status: ScanStatus;
  health?: HealthState;
  confidence?: number;
  detector?: string;
  evidence?: ScanEvidence[];
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
