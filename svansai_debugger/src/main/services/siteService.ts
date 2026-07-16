import dns from "node:dns/promises";
import tls from "node:tls";
import { SVANSAI_API_BASE_URL } from "../../shared/constants/api";
import type {
  HealthState,
  ScanEvidence,
  ScanFinding,
  ScanResult,
  ScanStatus,
} from "../../shared/types/scan";
import { diagnoseKnownSite } from "./siteAdapters";

type BrowserEvent = {
  kind?: string;
  url?: string;
  method?: string;
  status_code?: number | null;
  error?: string;
  resource_type?: string;
  timestamp?: string;
  duration_ms?: number | null;
};

type PageHealth = {
  observed_at?: string;
  ready_state?: string;
  load_duration_ms?: number | null;
  blank_page?: boolean;
  visible_error?: string;
  login_detected?: boolean;
  auth_redirect?: boolean;
  online?: boolean;
  cookies_enabled?: boolean;
  service_worker_controlled?: boolean;
  long_task_count?: number;
  max_event_loop_lag_ms?: number;
  error_count?: number;
  resource_error_count?: number;
};

type BrowserTab = {
  id?: number;
  title?: string;
  url?: string;
  active?: boolean;
  discarded?: boolean;
  status?: string;
  navigation_error?: string;
  page?: PageHealth;
  events?: BrowserEvent[];
};

type BrowserBridgePayload = {
  ok?: boolean;
  tabs?: BrowserTab[];
  updated_at?: string | null;
  stale?: boolean;
  error?: string;
};

type SiteProbe = {
  dnsOk: boolean;
  addresses: string[];
  tlsOk: boolean | null;
  tlsProtocol?: string;
  tlsError?: string;
  httpStatus?: number;
  httpOk: boolean | null;
  latencyMs?: number;
  error?: string;
};

const PROBE_LIMIT = 12;
const PROBE_TIMEOUT_MS = 6000;

function timestamp(): string {
  return new Date().toISOString();
}

function evidence(
  source: string,
  signal: string,
  value?: string | number | boolean | null,
  observedAt = timestamp(),
): ScanEvidence {
  return { source, signal, value, observedAt };
}

async function fetchBrowserTabs(sessionCode?: string, deviceToken?: string): Promise<BrowserBridgePayload> {
  if (!sessionCode || !deviceToken) {
    return { ok: false, error: "No connected debugger session was supplied." };
  }

  try {
    const query = new URLSearchParams({ session_code: sessionCode });
    const response = await fetch(
      `${SVANSAI_API_BASE_URL}/browser/tabs?${query.toString()}`,
      {
        method: "GET",
        headers: { Accept: "application/json", "X-Debugger-Token": deviceToken },
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401
            ? "Debugger session expired or is not authorized for browser telemetry."
            : `Browser telemetry backend returned ${response.status}.`,
      };
    }
    return (await response.json()) as BrowserBridgePayload;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Browser telemetry request failed.",
    };
  }
}

function getHostLabel(rawUrl?: string): string {
  if (!rawUrl) return "Unknown site";
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

function getClearSiteName(tab: BrowserTab): string {
  const host = getHostLabel(tab.url);
  const cleanTitle = (tab.title || "").trim();
  return cleanTitle && cleanTitle !== tab.url ? `${cleanTitle} — ${host}` : host;
}

async function probeTls(hostname: string, port: number): Promise<Pick<SiteProbe, "tlsOk" | "tlsProtocol" | "tlsError">> {
  return await new Promise((resolve) => {
    const socket = tls.connect({ hostname, port, servername: hostname, timeout: 4000 }, () => {
      const result = {
        tlsOk: socket.authorized,
        tlsProtocol: socket.getProtocol() || undefined,
        tlsError: socket.authorized ? undefined : String(socket.authorizationError || "TLS authorization failed"),
      };
      socket.destroy();
      resolve(result);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ tlsOk: false, tlsError: "TLS handshake timed out." });
    });
    socket.once("error", (error) => {
      socket.destroy();
      resolve({ tlsOk: false, tlsError: error.message });
    });
  });
}

async function probeSite(rawUrl: string): Promise<SiteProbe> {
  const probe: SiteProbe = { dnsOk: false, addresses: [], tlsOk: null, httpOk: null };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ...probe, error: "Invalid URL." };
  }

  try {
    const records = await dns.lookup(url.hostname, { all: true });
    probe.dnsOk = records.length > 0;
    probe.addresses = records.map((record) => record.address).slice(0, 4);
  } catch (error) {
    probe.error = error instanceof Error ? `DNS: ${error.message}` : "DNS lookup failed.";
    return probe;
  }

  if (url.protocol === "https:") {
    Object.assign(probe, await probeTls(url.hostname, Number(url.port || 443)));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url.origin, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "SVANSAI-Debugger/2.0" },
    });
    probe.httpStatus = response.status;
    probe.httpOk = response.status < 500;
    probe.latencyMs = Date.now() - started;
  } catch (error) {
    probe.httpOk = false;
    probe.error = error instanceof Error ? `HTTP: ${error.message}` : "HTTP probe failed.";
  } finally {
    clearTimeout(timer);
  }
  return probe;
}

function severityForHealth(health: HealthState): ScanStatus {
  if (health === "failed") return "problem";
  if (health === "degraded" || health === "unknown" || health === "not_tested") return "warning";
  return "good";
}

function classifyTab(tab: BrowserTab, probe?: SiteProbe): ScanFinding {
  const label = getClearSiteName(tab);
  const url = tab.url || "";
  const page = tab.page || {};
  const events = tab.events || [];
  const observed: ScanEvidence[] = [
    evidence("browser-tab", "tab-detected", Boolean(url)),
    evidence("browser-navigation", "navigation-status", tab.status || "unknown"),
  ];

  const navigationErrors = events.filter((event) => event.kind === "navigation-error");
  const requestErrors = events.filter((event) => event.kind === "request-error");
  const serverErrors = events.filter(
    (event) => event.kind === "request-complete" && Number(event.status_code) >= 500,
  );
  const clientErrors = events.filter(
    (event) => event.kind === "request-complete" && Number(event.status_code) >= 400 && Number(event.status_code) < 500,
  );
  const runtimeErrors = Number(page.error_count || 0);
  const resourceErrors = Number(page.resource_error_count || 0);
  const slowRequests = events.filter((event) => Number(event.duration_ms || 0) >= 5000);
  const parsedPageHeartbeat = page.observed_at ? Date.parse(page.observed_at) : Number.NaN;
  const pageHeartbeatAgeMs = Number.isFinite(parsedPageHeartbeat)
    ? Date.now() - parsedPageHeartbeat
    : null;
  const adapterDiagnosis = diagnoseKnownSite({
    url,
    visibleError: page.visible_error,
    statusCodes: events
      .map((event) => event.status_code)
      .filter((status): status is number => typeof status === "number"),
    requestErrors: requestErrors.length,
    loginDetected: Boolean(page.login_detected),
    authRedirect: Boolean(page.auth_redirect),
  });

  if (navigationErrors.length > 0 || tab.navigation_error) {
    observed.push(evidence("browser-navigation", "navigation-error", tab.navigation_error || navigationErrors[0]?.error));
  }
  if (serverErrors.length > 0) observed.push(evidence("browser-network", "server-errors", serverErrors.length));
  if (requestErrors.length > 0) observed.push(evidence("browser-network", "failed-requests", requestErrors.length));
  if (clientErrors.length > 0) observed.push(evidence("browser-network", "http-4xx-responses", clientErrors.length));
  if (page.visible_error) observed.push(evidence("page-observer", "visible-error-signature", page.visible_error));
  if (page.blank_page) observed.push(evidence("page-observer", "blank-page", true));
  if (runtimeErrors > 0) observed.push(evidence("page-observer", "runtime-errors", runtimeErrors));
  if (resourceErrors > 0) observed.push(evidence("page-observer", "resource-errors", resourceErrors));
  if (page.login_detected) observed.push(evidence("page-observer", "login-form-detected", true));
  if (page.auth_redirect) observed.push(evidence("page-observer", "authentication-path", true));
  if (page.online !== undefined) observed.push(evidence("page-observer", "browser-online", page.online));
  if (page.cookies_enabled !== undefined) observed.push(evidence("page-observer", "cookies-enabled", page.cookies_enabled));
  if (page.service_worker_controlled !== undefined) observed.push(evidence("page-observer", "service-worker-controlled", page.service_worker_controlled));
  if (page.load_duration_ms != null) observed.push(evidence("performance", "page-load-ms", page.load_duration_ms));
  if (pageHeartbeatAgeMs != null) observed.push(evidence("page-observer", "heartbeat-age-ms", Math.max(0, pageHeartbeatAgeMs)));
  if (page.long_task_count != null) observed.push(evidence("performance", "long-task-count", page.long_task_count));
  if (page.max_event_loop_lag_ms != null) observed.push(evidence("performance", "max-event-loop-lag-ms", page.max_event_loop_lag_ms));
  if (slowRequests.length > 0) observed.push(evidence("performance", "slow-request-count", slowRequests.length));
  if (probe) {
    observed.push(evidence("local-probe", "dns-ok", probe.dnsOk));
    observed.push(evidence("local-probe", "tls-ok", probe.tlsOk));
    observed.push(evidence("local-probe", "http-status", probe.httpStatus ?? null));
    if (probe.latencyMs != null) observed.push(evidence("local-probe", "latency-ms", probe.latencyMs));
  }
  if (adapterDiagnosis) {
    observed.push(evidence("site-adapter", "adapter", adapterDiagnosis.adapter));
  }

  let health: HealthState = "detected";
  let confidence = 0.55;
  let detail = url || "Tab has no URL reported.";
  let fix = "No action needed.";
  let detector = "site-evidence-correlator";

  if (!url) {
    health = "unknown";
    confidence = 0.98;
    detail = "The browser reported a tab without a usable URL.";
    fix = "Reload or close the tab, then re-run the Sites scan.";
  } else if (url.startsWith("http://")) {
    health = "degraded";
    confidence = 0.99;
    detail = "The page is using an unencrypted HTTP connection.";
    fix = "Use the HTTPS version before entering sensitive information.";
    detector = "transport-security";
  } else if (page.online === false) {
    health = "failed";
    confidence = 0.98;
    detail = "The browser reports that it is offline.";
    fix = "Restore the active network connection, then re-scan to verify navigation and requests.";
    detector = "browser-connectivity";
  } else if (navigationErrors.length > 0 || tab.navigation_error) {
    health = "failed";
    confidence = 0.98;
    detail = `Navigation failed: ${tab.navigation_error || navigationErrors[0]?.error || "unknown browser error"}`;
    fix = "Run the targeted network checks, then retry in a clean tab or private window.";
    detector = "browser-navigation";
  } else if (page.visible_error || page.blank_page || serverErrors.length > 0) {
    health = "failed";
    confidence = page.visible_error ? 0.97 : 0.9;
    detail = page.visible_error
      ? `The page displays a recognized failure: ${page.visible_error}`
      : page.blank_page
        ? "The page finished loading but appears blank."
        : `${serverErrors.length} server-side request failure(s) were observed.`;
    fix = "Open Guided Fix Chat so SVANSAI can correlate the page, request, and local-network evidence.";
    detector = page.visible_error ? "visible-error-signature" : "page-request-health";
  } else if (page.cookies_enabled === false && (page.login_detected || page.auth_redirect)) {
    health = "degraded";
    confidence = 0.94;
    detail = "Cookies are disabled while the site is attempting authentication.";
    fix = "Allow cookies for the site and its authentication provider, then sign in again and verify the session.";
    detector = "authentication-cookie";
  } else if (requestErrors.length >= 3 || runtimeErrors >= 3 || resourceErrors >= 3) {
    health = "degraded";
    confidence = 0.86;
    detail = `${requestErrors.length} failed request(s), ${runtimeErrors} runtime error(s), and ${resourceErrors} resource error(s) were observed.`;
    fix = "Review the failed resources and console evidence in Guided Fix Chat.";
  } else if (probe && (!probe.dnsOk || probe.tlsOk === false || probe.httpOk === false)) {
    health = "degraded";
    confidence = 0.82;
    detail = `The tab is present, but a local service probe failed: ${probe.error || probe.tlsError || "service endpoint unreachable"}`;
    fix = "Check DNS, TLS, proxy, VPN, firewall, and service availability.";
    detector = "layered-service-probe";
  } else if (pageHeartbeatAgeMs !== null && pageHeartbeatAgeMs > 45000) {
    health = "degraded";
    confidence = 0.82;
    detail = `Page-health telemetry has not updated for ${Math.round(pageHeartbeatAgeMs / 1000)} seconds, which can indicate a frozen page or suspended content script.`;
    fix = "Interact with the page, check whether it responds, and compare app CPU/memory before reloading it.";
    detector = "page-heartbeat";
  } else if (Number(page.max_event_loop_lag_ms || 0) > 2000 || Number(page.long_task_count || 0) >= 10) {
    health = "degraded";
    confidence = 0.84;
    detail = `The page showed responsiveness problems (${page.long_task_count || 0} long tasks; maximum event-loop delay ${page.max_event_loop_lag_ms || 0} ms).`;
    fix = "Compare the page with extensions disabled and inspect CPU, memory, and long-running scripts.";
    detector = "page-responsiveness";
  } else if (Number(page.load_duration_ms || 0) > 10000 || slowRequests.length >= 3) {
    health = "degraded";
    confidence = 0.8;
    detail = `The page or its requests were slow (${Math.round(Number(page.load_duration_ms || 0))} ms load; ${slowRequests.length} request(s) over five seconds).`;
    fix = "Check request timing, network latency, extensions, and system resource pressure.";
    detector = "performance-baseline";
  } else if (tab.status === "complete" && page.ready_state === "complete" && probe?.dnsOk && probe.tlsOk !== false) {
    health = "healthy";
    confidence = 0.9;
    detail = `Navigation completed, the page reached ready state, and the local DNS/TLS checks passed. ${url}`;
  } else {
    health = "detected";
    confidence = 0.7;
    detail = `The tab was detected, but there is not enough evidence yet to prove that the application is healthy. ${url}`;
    fix = "Keep monitoring enabled, reload the page, and re-run the scan after navigation completes.";
  }

  if (adapterDiagnosis && health !== "healthy") {
    detail = `${detail} ${adapterDiagnosis.hypothesis}`;
    fix = `${fix} Next targeted test: ${adapterDiagnosis.nextTest}`;
    detector = `${detector}+${adapterDiagnosis.adapter.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  return {
    category: "Sites",
    item: label,
    status: severityForHealth(health),
    health,
    confidence,
    detector,
    evidence: observed,
    detail,
    fix,
  };
}

export async function scanSites(sessionCode?: string, deviceToken?: string): Promise<ScanResult & { scope: "sites" }> {
  const logs: string[] = ["[SITES] Starting authenticated browser telemetry scan."];
  const payload = await fetchBrowserTabs(sessionCode, deviceToken);

  if (!payload.ok || !Array.isArray(payload.tabs)) {
    return {
      scope: "sites",
      summary: "Live website diagnostics are unavailable.",
      findings: [{
        category: "Sites",
        item: "Browser telemetry connection",
        status: "problem",
        health: "failed",
        confidence: 0.99,
        detector: "browser-bridge-auth",
        evidence: [evidence("browser-bridge", "connection-error", payload.error || "Invalid response")],
        detail: payload.error || "The browser monitor did not return valid data.",
        fix: "Reconnect the debugger, enter the same session code in the extension, and enable monitoring.",
      }],
      logs: [...logs, `[SITES] ${payload.error || "Invalid browser telemetry response."}`],
      recommendations: ["Reconnect the browser monitor with the current debugger session code."],
      scannedAt: timestamp(),
    };
  }

  if (!payload.updated_at || payload.tabs.length === 0) {
    const staleNote = payload.stale ? " Previous telemetry expired." : "";
    return {
      scope: "sites",
      summary: `No current browser telemetry is available.${staleNote}`,
      findings: [{
        category: "Sites",
        item: "Browser monitoring coverage",
        status: "warning",
        health: "not_tested",
        confidence: 0.99,
        detector: "coverage-check",
        evidence: [evidence("browser-bridge", "tab-count", 0)],
        detail: "No fresh monitored tabs were received, so no website can be declared healthy.",
        fix: "Enable monitoring in the extension, open or reload the affected site, then scan again.",
      }],
      logs: [...logs, "[SITES] No fresh telemetry received."],
      recommendations: ["Enable the Site Monitor and reload the affected page."],
      scannedAt: timestamp(),
    };
  }

  const origins = Array.from(new Set(payload.tabs.map((tab) => {
    try { return new URL(tab.url || "").origin; } catch { return ""; }
  }).filter(Boolean))).slice(0, PROBE_LIMIT);
  logs.push(`[SITES] Received ${payload.tabs.length} tab(s); probing ${origins.length} unique origin(s).`);
  const probeEntries = await Promise.all(origins.map(async (origin) => [origin, await probeSite(origin)] as const));
  const probes = new Map(probeEntries);
  const findings = payload.tabs.slice(0, 50).map((tab) => {
    let origin = "";
    try { origin = new URL(tab.url || "").origin; } catch { /* invalid URLs are classified below */ }
    return classifyTab(tab, probes.get(origin));
  });

  const failed = findings.filter((finding) => finding.health === "failed").length;
  const degraded = findings.filter((finding) => finding.health === "degraded").length;
  const healthy = findings.filter((finding) => finding.health === "healthy").length;
  const unverified = findings.length - failed - degraded - healthy;
  logs.push(`[SITES] ${healthy} healthy, ${degraded} degraded, ${failed} failed, ${unverified} unverified.`);

  if (failed > 0 || degraded > 0) {
    const affectedHosts = new Set(
      payload.tabs
        .filter((_, index) => ["failed", "degraded"].includes(findings[index]?.health || ""))
        .map((tab) => getHostLabel(tab.url)),
    );
    const broadIncident = affectedHosts.size >= 2 && healthy === 0;
    findings.unshift({
      category: "Sites",
      item: "Incident scope",
      status: broadIncident ? "warning" : "good",
      health: broadIncident ? "degraded" : "detected",
      confidence: 0.83,
      detector: "cross-site-correlation",
      evidence: [
        evidence("site-correlator", "affected-hosts", affectedHosts.size),
        evidence("site-correlator", "healthy-tabs", healthy),
      ],
      detail: broadIncident
        ? `Failures affect ${affectedHosts.size} hosts with no verified healthy comparison tab, suggesting a browser-wide or network-wide cause.`
        : `The evidence is concentrated in ${affectedHosts.size} host(s) while ${healthy} tab(s) remain verified healthy, suggesting a site-specific or session-specific cause.`,
      fix: broadIncident
        ? "Run Network and Apps scans, then compare a private browser profile or alternate network."
        : "Focus Guided Fix Chat on the affected site's requests, authentication, and adapter-specific tests.",
    });
  }

  const recommendations = [
    failed > 0
      ? "Open Guided Fix Chat on a failed site so SVANSAI can rank causes from the captured evidence."
      : "Keep monitoring active while reproducing intermittent failures.",
    "Re-run the scan after each attempted fix to verify recovery with fresh evidence.",
  ];

  return {
    scope: "sites",
    summary: `Analyzed ${findings.length} monitored tab(s): ${healthy} healthy, ${degraded} degraded, ${failed} failed, ${unverified} detected but not proven healthy.`,
    findings,
    logs,
    recommendations,
    scannedAt: timestamp(),
    meta: {
      updatedAt: payload.updated_at,
      tabCount: payload.tabs.length,
      probedOrigins: origins.length,
      coverageLimited: origins.length < new Set(payload.tabs.map((tab) => tab.url)).size,
    },
  };
}
