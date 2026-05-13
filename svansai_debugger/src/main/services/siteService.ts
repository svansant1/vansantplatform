import { SVANSAI_API_BASE_URL } from "../../shared/constants/api";
import type { ScanFinding, ScanResult } from "../../shared/types/scan";

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

async function fetchBrowserTabs(): Promise<BrowserBridgePayload> {
  try {
    const response = await fetch(`${SVANSAI_API_BASE_URL}/browser/tabs`, {
      method: "GET",
      headers: { Accept: "application/json" },
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

function classifyTab(tab: BrowserTab): ScanFinding {
  const label = getClearSiteName(tab);
  const url = tab.url || "";

  if (!url) {
    return {
      category: "Sites",
      item: label,
      status: "warning",
      detail: "Tab has no URL reported.",
      fix: "Inspect this tab manually.",
    };
  }

  if (url.startsWith("http://")) {
    return {
      category: "Sites",
      item: label,
      status: "warning",
      detail: `Insecure connection: ${url}`,
      fix: "Navigate to the HTTPS version of this site or avoid entering sensitive data.",
    };
  }

  return {
    category: "Sites",
    item: label,
    status: "good",
    detail: url,
    fix: "No action needed.",
  };
}

export async function scanSites(): Promise<ScanResult & { scope: "sites" }> {
  const logs: string[] = ["[SITES] Starting browser bridge scan."];

  const payload = await fetchBrowserTabs();

  if (!Array.isArray(payload.tabs)) {
    logs.push("[SITES] Browser extension bridge unavailable or returned invalid data.");

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

  const updatedAt = payload.updated_at ? new Date(payload.updated_at) : null;
  const staleSince =
    updatedAt ? Math.floor((Date.now() - updatedAt.getTime()) / 1000) : null;
  const isStale = staleSince !== null && staleSince > 300;

  logs.push(`[SITES] Received ${payload.tabs.length} tabs from browser bridge.`);
  if (updatedAt) {
    logs.push(`[SITES] Bridge last updated at ${updatedAt.toLocaleString()}${isStale ? " — data may be stale." : ""}`);
  }

  const findings: ScanFinding[] = payload.tabs.slice(0, 50).map(classifyTab);

  if (isStale && staleSince !== null) {
    const minutes = Math.floor(staleSince / 60);
    findings.unshift({
      category: "Sites",
      item: "Browser bridge data",
      status: "warning",
      detail: `Tab data from the browser bridge is ${minutes} minute(s) old. It may not reflect currently open tabs.`,
      fix: "Reload the browser extension or ensure the bridge is running.",
    });
  }

  const insecureCount = findings.filter(
    (f) => f.status === "warning" && f.detail.startsWith("Insecure"),
  ).length;

  const problemCount = findings.filter((f) => f.status === "problem").length;
  const warningCount = findings.filter((f) => f.status === "warning").length;

  logs.push(`[SITES] ${problemCount} problems, ${warningCount} warnings detected.`);

  const recommendations: string[] = [
    "Review open sites and close unnecessary tabs before deeper troubleshooting.",
  ];

  if (insecureCount > 0) {
    recommendations.push(
      `${insecureCount} tab(s) are using insecure HTTP. Switch to HTTPS where possible.`,
    );
  }

  recommendations.push(
    "Extend the browser bridge next with console-error and request-failure capture.",
  );

  return {
    scope: "sites",
    summary: `Scanned ${payload.tabs.length} open tab(s). ${problemCount} problem(s), ${warningCount} warning(s) detected.${insecureCount > 0 ? ` ${insecureCount} insecure HTTP tab(s).` : ""}`,
    findings,
    logs,
    recommendations,
    scannedAt: new Date().toISOString(),
    meta: {
      updatedAt: payload.updated_at ?? null,
      tabCount: payload.tabs.length,
      insecureTabCount: insecureCount,
    },
  };
}
