import os from "node:os";
import dns from "node:dns/promises";

type ScanStatus = "good" | "warning" | "problem";

type ScanFinding = {
  category: string;
  item: string;
  status: ScanStatus;
  detail: string;
  fix: string;
};

type ScanResult = {
  scope: "network";
  summary: string;
  findings: ScanFinding[];
  logs: string[];
  recommendations: string[];
  scannedAt: string;
  meta?: Record<string, unknown>;
};

function buildRecommendations(findings: ScanFinding[]): string[] {
  const recommendations: string[] = [];
  const hasProblem = findings.some((item) => item.status === "problem");
  const hasWarning = findings.some((item) => item.status === "warning");

  if (hasProblem) {
    recommendations.push(
      "Inspect DNS, adapter connectivity, and firewall/VPN behavior before trusting remote diagnostics.",
    );
  }

  if (hasWarning) {
    recommendations.push(
      "Review adapter addressing and verify network path stability if connectivity is intermittent.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Network baseline appears healthy in this scan pass.");
  }

  return recommendations;
}

export async function scanNetwork(): Promise<ScanResult> {
  const logs: string[] = ["[NETWORK] Starting adapter and DNS scan."];
  const findings: ScanFinding[] = [];

  try {
    const interfaces = os.networkInterfaces();
    const activeInterfaces = Object.entries(interfaces).filter(([, entries]) =>
      (entries ?? []).some((entry) => !entry.internal),
    );

    logs.push(`[NETWORK] Found ${activeInterfaces.length} active external adapters.`);

    if (activeInterfaces.length === 0) {
      findings.push({
        category: "Network",
        item: "Active adapters",
        status: "problem",
        detail: "No active external network adapters were detected.",
        fix: "Enable a network adapter or verify Ethernet/Wi-Fi hardware connection."
      });
    }

    for (const [name, entries] of activeInterfaces) {
      const usableEntries = (entries ?? []).filter((entry) => !entry.internal);

      findings.push({
        category: "Network",
        item: name,
        status: "good",
        detail: `Adapter active with ${usableEntries.length} external address record(s).`,
        fix: "No action needed."
      });

      for (const entry of usableEntries) {
        const isLocalOnly =
          entry.address.startsWith("169.254.") ||
          entry.address === "0.0.0.0";

        findings.push({
          category: "Network",
          item: `${name} ${entry.family}`,
          status: isLocalOnly ? "warning" : "good",
          detail: `Address ${entry.address}${entry.cidr ? ` (${entry.cidr})` : ""}`,
          fix: "Reconnect network, check DHCP settings, or restart the router."
        });
      }
    }

    try {
      await dns.lookup("google.com");
      findings.push({
        category: "Network",
        item: "DNS lookup",
        status: "good",
        detail: "External DNS lookup succeeded.",
        fix: "No action needed."
      });
      logs.push("[NETWORK] DNS lookup succeeded.");
    } catch (error) {
      findings.push({
        category: "Network",
        item: "DNS lookup",
        status: "problem",
        detail:
          error instanceof Error ? error.message : "DNS lookup failed.",
          fix: "Check internet connection, DNS settings, VPN/firewall rules, or restart the router."
      });
      logs.push("[NETWORK] DNS lookup failed.");
    }

    const problemCount = findings.filter((item) => item.status === "problem").length;
    const warningCount = findings.filter((item) => item.status === "warning").length;

    logs.push(`[NETWORK] ${problemCount} problems, ${warningCount} warnings detected.`);

    return {
      scope: "network",
      summary: `Scanned ${activeInterfaces.length} active adapter(s). ${problemCount} problem(s), ${warningCount} warning(s) detected.`,
      findings,
      logs,
      recommendations: buildRecommendations(findings),
      scannedAt: new Date().toISOString(),
      meta: {
        activeAdapters: activeInterfaces.length,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network scan failure.";

    logs.push("[NETWORK] Network scan failed.");
    logs.push(`[NETWORK] Error: ${message}`);

    return {
      scope: "network",
      summary: "Network scan failed.",
      findings: [
        {
          category: "Network",
          item: "Network scan",
          status: "problem",
          detail: message,
          fix: "Verify OS networking APIs are accessible and retry the scan."
        },
      ],
      logs,
      recommendations: [
        "Verify OS networking APIs are available and that the app can inspect adapter state.",
      ],
      scannedAt: new Date().toISOString(),
    };
  }
}
