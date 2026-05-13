import os from "node:os";
import dns from "node:dns/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScanFinding, ScanResult } from "../../shared/types/scan";

const execFileAsync = promisify(execFile);

const VPN_NAME_PATTERN =
  /tap|wireguard|vpn|tun0|nordvpn|expressvpn|surfshark|mullvad|protonvpn|openvpn|cisco\s*vpn|globalprotect|pulsesecure/i;

async function getDefaultGateway(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NonInteractive",
      "-NoProfile",
      "-Command",
      "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1).NextHop",
    ]);
    const gw = stdout.trim();
    return gw && gw !== "" ? gw : null;
  } catch {
    return null;
  }
}

async function pingHost(
  host: string,
): Promise<{ reachable: boolean; avgMs?: number }> {
  try {
    const { stdout } = await execFileAsync("ping", [
      "-n",
      "2",
      "-w",
      "1500",
      host,
    ]);
    const match = /Average = (\d+)ms/i.exec(stdout);
    if (match) return { reachable: true, avgMs: Number(match[1]) };
    // Ping succeeded but average not parseable (e.g. < 1ms)
    if (/Reply from/i.test(stdout)) return { reachable: true };
    return { reachable: false };
  } catch {
    return { reachable: false };
  }
}

function buildRecommendations(findings: ScanFinding[]): string[] {
  const recommendations: string[] = [];
  const hasProblem = findings.some((f) => f.status === "problem");
  const hasWarning = findings.some((f) => f.status === "warning");

  if (hasProblem) {
    recommendations.push(
      "Inspect DNS, gateway reachability, and firewall or VPN behavior before trusting remote diagnostics.",
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

export async function scanNetwork(): Promise<ScanResult & { scope: "network" }> {
  const logs: string[] = ["[NETWORK] Starting adapter and DNS scan."];
  const findings: ScanFinding[] = [];

  try {
    const interfaces = os.networkInterfaces();
    const allEntries = Object.entries(interfaces);
    const activeInterfaces = allEntries.filter(([, entries]) =>
      (entries ?? []).some((e) => !e.internal),
    );

    logs.push(`[NETWORK] Found ${activeInterfaces.length} active external adapter(s).`);

    if (activeInterfaces.length === 0) {
      findings.push({
        category: "Network",
        item: "Active adapters",
        status: "problem",
        detail: "No active external network adapters were detected.",
        fix: "Enable a network adapter or verify Ethernet/Wi-Fi hardware connection.",
      });
    }

    let vpnDetected = false;

    for (const [name, entries] of activeInterfaces) {
      const usable = (entries ?? []).filter((e) => !e.internal);
      const isVpn = VPN_NAME_PATTERN.test(name);

      if (isVpn) {
        vpnDetected = true;
        findings.push({
          category: "Network",
          item: `VPN Adapter: ${name}`,
          status: "warning",
          detail: `A VPN or tunnel adapter is active. All traffic may be routed through an external server.`,
          fix: "Confirm this VPN connection is intentional. Disconnect if it is unexpected.",
        });
        logs.push(`[NETWORK] VPN adapter detected: ${name}`);
      } else {
        findings.push({
          category: "Network",
          item: name,
          status: "good",
          detail: `Adapter active with ${usable.length} external address record(s).`,
          fix: "No action needed.",
        });
      }

      for (const entry of usable) {
        const isLocalOnly =
          entry.address.startsWith("169.254.") || entry.address === "0.0.0.0";

        findings.push({
          category: "Network",
          item: `${name} ${entry.family}`,
          status: isLocalOnly ? "warning" : "good",
          detail: `Address: ${entry.address}${entry.cidr ? ` (${entry.cidr})` : ""}${isLocalOnly ? " — APIPA/link-local address, no DHCP lease." : ""}`,
          fix: isLocalOnly
            ? "Reconnect the network, check DHCP settings, or restart the router."
            : "No action needed.",
        });
      }
    }

    // DNS check
    try {
      await dns.lookup("google.com");
      findings.push({
        category: "Network",
        item: "DNS resolution",
        status: "good",
        detail: "External DNS lookup succeeded (google.com resolved).",
        fix: "No action needed.",
      });
      logs.push("[NETWORK] DNS lookup succeeded.");
    } catch (error) {
      findings.push({
        category: "Network",
        item: "DNS resolution",
        status: "problem",
        detail: error instanceof Error ? error.message : "DNS lookup failed.",
        fix: "Check internet connection, DNS settings, VPN/firewall rules, or restart the router.",
      });
      logs.push("[NETWORK] DNS lookup failed.");
    }

    // Gateway detection + ping
    const gateway = await getDefaultGateway();
    if (gateway) {
      logs.push(`[NETWORK] Default gateway: ${gateway}`);
      const gwPing = await pingHost(gateway);

      if (gwPing.reachable) {
        const latencyNote =
          gwPing.avgMs !== undefined ? ` Avg latency: ${gwPing.avgMs} ms.` : "";
        findings.push({
          category: "Network",
          item: `Gateway (${gateway})`,
          status: "good",
          detail: `Default gateway is reachable.${latencyNote}`,
          fix: "No action needed.",
        });
        logs.push(`[NETWORK] Gateway ping succeeded.${gwPing.avgMs !== undefined ? ` Avg ${gwPing.avgMs}ms.` : ""}`);
      } else {
        findings.push({
          category: "Network",
          item: `Gateway (${gateway})`,
          status: "problem",
          detail: `Default gateway ${gateway} is not responding to ping. Internet access may be broken.`,
          fix: "Restart your router or modem. Check the Ethernet/Wi-Fi connection.",
        });
        logs.push("[NETWORK] Gateway ping failed.");
      }
    } else {
      findings.push({
        category: "Network",
        item: "Default gateway",
        status: "warning",
        detail: "No default gateway could be determined.",
        fix: "Check routing configuration or run 'route print' to inspect the routing table.",
      });
      logs.push("[NETWORK] Default gateway not found.");
    }

    // Latency to 1.1.1.1
    const externalPing = await pingHost("1.1.1.1");
    if (externalPing.reachable) {
      const ms = externalPing.avgMs;
      const status: ScanFinding["status"] =
        ms !== undefined && ms > 150 ? "warning" : "good";
      findings.push({
        category: "Network",
        item: "External latency (1.1.1.1)",
        status,
        detail: ms !== undefined ? `Avg latency to Cloudflare DNS: ${ms} ms.` : "Reachable — latency not measured.",
        fix:
          status === "warning"
            ? "High latency detected. Check for congestion, background downloads, or VPN overhead."
            : "No action needed.",
      });
      logs.push(`[NETWORK] External ping to 1.1.1.1 succeeded.${ms !== undefined ? ` ${ms}ms.` : ""}`);
    } else {
      findings.push({
        category: "Network",
        item: "External latency (1.1.1.1)",
        status: "problem",
        detail: "Cannot reach 1.1.1.1. Internet connectivity may be blocked.",
        fix: "Check firewall rules, router connection, or whether ICMP is blocked on the network.",
      });
      logs.push("[NETWORK] External ping to 1.1.1.1 failed.");
    }

    if (vpnDetected) {
      logs.push("[NETWORK] VPN was active during this scan. Remote results may differ.");
    }

    const problemCount = findings.filter((f) => f.status === "problem").length;
    const warningCount = findings.filter((f) => f.status === "warning").length;

    logs.push(`[NETWORK] ${problemCount} problems, ${warningCount} warnings detected.`);

    return {
      scope: "network",
      summary: `Scanned ${activeInterfaces.length} adapter(s). ${problemCount} problem(s), ${warningCount} warning(s) detected.${vpnDetected ? " VPN active." : ""}`,
      findings,
      logs,
      recommendations: buildRecommendations(findings),
      scannedAt: new Date().toISOString(),
      meta: {
        activeAdapters: activeInterfaces.length,
        vpnDetected,
        gateway: gateway ?? null,
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
          fix: "Verify OS networking APIs are accessible and retry the scan.",
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
