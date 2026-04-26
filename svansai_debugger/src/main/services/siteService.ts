import { SVANSAI_API_BASE_URL } from "../../shared/constants/api";

type ScanStatus = "good" | "warning" | "problem";

type ScanFinding = {
  category: string;
  item: string;
  status: ScanStatus;
  detail: string;
  fix: string;
};

type BrowserTab = {
  id?: number;
  title?: string;
  url?: string;
};

type BrowserBridgePayload = {
  ok?: boolean;
  tabs?: BrowserTab[];
  updated_at?: string | null;
  error?: string;
};

type ScanResult = {
  scope: "sites";
  summary: string;
  findings: ScanFinding[];
  logs: string[];
  recommendations: string[];
  scannedAt: string;
  meta?: Record<string, unknown>;
};

async function fetchBrowserTabs(): Promise<BrowserBridgePayload> {
  try {
    const response = await fetch(`${SVANSAI_API_BASE_URL}/browser/tabs`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    return (await response.json()) as BrowserBridgePayload;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Browser bridge request failed.",
    };
  }
}

function getHostLabel(rawUrl?: string): string {
  if (!rawUrl) return "Unknown site";

  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

function getClearSiteName(tab: BrowserTab): string {
  const host = getHostLabel(tab.url);
  const cleanTitle = (tab.title || "").trim();

  if (cleanTitle && cleanTitle !== tab.url) {
    return `${cleanTitle} — ${host}`;
  }

  return host;
}

export async function scanSites(): Promise<ScanResult> {
  const logs: string[] = ["[SITES] Starting browser bridge scan."];

  const payload = await fetchBrowserTabs();

  if (!payload.ok || !Array.isArray(payload.tabs)) {
    logs.push(
      "[SITES] Browser extension bridge unavailable or returned invalid data.",
    );

    return {
      scope: "sites",
      summary:
        "Live open-site detection is not available yet. Install the browser extension and run the SVANSAI browser bridge backend.",
      findings: [
        {
          category: "Sites",
          item: "Open tab detection",
          status: "problem",
          detail: payload.error || "Browser extension bridge is not connected.",
          fix: "Load the browser extension and make sure the SVANSAI backend exposes /browser/tabs.",
        },
      ],
      logs,
      recommendations: [
        "Load the browser extension as an unpacked extension in Chrome or Edge.",
        "Run the SVANSAI backend and verify /browser/tabs responds successfully.",
      ],
      scannedAt: new Date().toISOString(),
    };
  }

  const findings: ScanFinding[] = payload.tabs.slice(0, 50).map((tab) => ({
  category: "Sites",
  item: getClearSiteName(tab),
  status: "good",
  detail: tab.url || "No URL reported.",
  fix: "No action needed.",
}));

  logs.push(`[SITES] Received ${payload.tabs.length} tabs from browser bridge.`);

  return {
    scope: "sites",
    summary: `Scanned ${payload.tabs.length} open tab(s) from the browser extension bridge.`,
    findings,
    logs,
    recommendations: [
      "Review open sites and close unnecessary tabs before deeper troubleshooting.",
      "Extend the browser bridge next with console-error and request-failure capture.",
    ],
    scannedAt: new Date().toISOString(),
    meta: {
      updatedAt: payload.updated_at ?? null,
      tabCount: payload.tabs.length,
    },
  };
}