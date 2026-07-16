import os from "node:os";
import dns from "node:dns/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScanFinding, ScanResult } from "../../shared/types/scan";

const execFileAsync = promisify(execFile);
const HTTP_TIMEOUT_MS = 7000;

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

async function probeHttp(url: string): Promise<{ ok: boolean; status?: number; latencyMs?: number; body?: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return {
      ok: response.status < 500,
      status: response.status,
      latencyMs: Date.now() - started,
      body: (await response.text()).slice(0, 200),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "HTTP probe failed." };
  } finally {
    clearTimeout(timer);
  }
}

async function getProxyConfiguration(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$i=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; [pscustomobject]@{ProxyEnable=$i.ProxyEnable;ProxyServer=$i.ProxyServer;AutoConfigURL=$i.AutoConfigURL;AutoDetect=$i.AutoDetect} | ConvertTo-Json -Compress",
    ]);
    return stdout.trim();
  } catch {
    return "unavailable";
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

    // HTTPS/TLS and captive-portal checks. These are stronger evidence than ICMP.
    const [connectivityProbe, platformProbe, proxyConfiguration] = await Promise.all([
      probeHttp("https://www.msftconnecttest.com/connecttest.txt"),
      probeHttp("https://vansant-backend.onrender.com/"),
      getProxyConfiguration(),
    ]);
    const captivePortal = connectivityProbe.ok && connectivityProbe.body?.trim() !== "Microsoft Connect Test";
    findings.push({
      category: "Network",
      item: "HTTPS and captive-portal check",
      status: !connectivityProbe.ok ? "problem" : captivePortal ? "warning" : "good",
      health: !connectivityProbe.ok ? "failed" : captivePortal ? "degraded" : "healthy",
      confidence: 0.94,
      detector: "https-connectivity",
      evidence: [
        { source: "HTTPS probe", signal: "status", value: connectivityProbe.status ?? null, observedAt: new Date().toISOString() },
        { source: "HTTPS probe", signal: "latency-ms", value: connectivityProbe.latencyMs ?? null, observedAt: new Date().toISOString() },
        { source: "HTTPS probe", signal: "captive-portal", value: Boolean(captivePortal), observedAt: new Date().toISOString() },
      ],
      detail: !connectivityProbe.ok
        ? `HTTPS connectivity failed: ${connectivityProbe.error || "unknown error"}`
        : captivePortal
          ? "The connectivity-check response was replaced, which can indicate a captive portal or network filter."
          : `HTTPS connectivity succeeded in ${connectivityProbe.latencyMs ?? "?"} ms.`,
      fix: !connectivityProbe.ok
        ? "Inspect DNS, TLS, proxy, VPN, firewall, and secure-DNS configuration."
        : captivePortal
          ? "Open a normal browser page and complete the network sign-in or inspect filtering software."
          : "No action needed.",
    });
    findings.push({
      category: "Network",
      item: "SVANSAI service path",
      status: platformProbe.ok ? "good" : "warning",
      health: platformProbe.ok ? "healthy" : "degraded",
      confidence: 0.9,
      detector: "target-service-probe",
      evidence: [{ source: "HTTPS probe", signal: "status", value: platformProbe.status ?? null, observedAt: new Date().toISOString() }],
      detail: platformProbe.ok
        ? `The SVANSAI backend path is reachable (HTTP ${platformProbe.status}).`
        : `The SVANSAI backend path could not be reached: ${platformProbe.error || "unknown error"}`,
      fix: platformProbe.ok ? "No action needed." : "Check service status, firewall, VPN, proxy, and DNS behavior for vansant-backend.onrender.com.",
    });
    findings.push({
      category: "Network",
      item: "Windows browser proxy configuration",
      status: "good",
      health: "detected",
      confidence: 0.99,
      detector: "proxy-configuration",
      evidence: [{ source: "Windows Internet Settings", signal: "configuration", value: proxyConfiguration, observedAt: new Date().toISOString() }],
      detail: "Proxy and automatic-configuration settings were recorded for correlation. Detection alone does not mean the proxy is faulty.",
      fix: "No action needed.",
    });
    logs.push("[NETWORK] Completed HTTPS, captive-portal, target-service, and proxy checks.");

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
        status: "warning",
        health: "unknown",
        confidence: 0.99,
        detector: "icmp-probe",
        detail: "1.1.1.1 did not answer ICMP. This is inconclusive because networks may block ping while HTTPS still works.",
        fix: "Use the DNS, TCP, TLS, and HTTPS findings to determine whether connectivity is actually broken.",
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
