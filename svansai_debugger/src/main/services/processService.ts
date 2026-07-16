import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { ScanFinding, ScanResult } from "../../shared/types/scan";

const execFileAsync = promisify(execFile);

type TaskListRow = {
  imageName: string;
  pid: number;
  sessionName: string;
  sessionNumber: number;
  memUsageKb: number;
};

type AggregatedProcess = {
  imageName: string;
  totalMemKb: number;
  maxMemKb: number;
  count: number;
  pids: number[];
};

type LiveProcessHealth = {
  ProcessName?: string;
  Id?: number;
  CpuPercent?: number;
  WorkingSet64?: number;
  Handles?: number;
  Responding?: boolean;
  StartTime?: string;
  NetworkConnections?: number;
};

type AppEvent = {
  TimeCreated?: string;
  Id?: number;
  ProviderName?: string;
  Message?: string;
};

const PROCESS_LABELS: Record<string, string> = {
  "Code.exe": "Visual Studio Code",
  "msedge.exe": "Microsoft Edge",
  "chrome.exe": "Google Chrome",
  "python.exe": "Python",
  "pythonw.exe": "Python (windowless)",
  "node.exe": "Node.js",
  "explorer.exe": "Windows Explorer",
  "cmd.exe": "Command Prompt",
  "powershell.exe": "PowerShell",
  "pwsh.exe": "PowerShell Core",
  "WindowsTerminal.exe": "Windows Terminal",
  "SearchIndexer.exe": "Windows Search Indexer",
  "Taskmgr.exe": "Task Manager",
  "svchost.exe": "Windows Service Host",
};

// Instance counts beyond these thresholds are flagged
const INSTANCE_WARN_THRESHOLD: Record<string, number> = {
  "svchost.exe": 60,
  "msedge.exe": 30,
  "chrome.exe": 30,
  "RuntimeBroker.exe": 20,
};
const DEFAULT_INSTANCE_WARN = 12;
const processBaselines = new Map<string, { samples: number; averageKb: number }>();

function getFriendlyProcessName(imageName: string): string {
  return PROCESS_LABELS[imageName] || imageName.replace(/\.exe$/i, "");
}

function parseTasklistCsv(stdout: string): TaskListRow[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const cells = line
      .replace(/^"|"$/g, "")
      .split('","')
      .map((cell) => cell.trim());

    const memRaw = (cells[4] ?? "0").replace(/[^\d]/g, "");

    return {
      imageName: cells[0] ?? "Unknown",
      pid: Number(cells[1] ?? 0),
      sessionName: cells[2] ?? "Unknown",
      sessionNumber: Number(cells[3] ?? 0),
      memUsageKb: Number(memRaw || 0),
    };
  });
}

function aggregateProcesses(rows: TaskListRow[]): AggregatedProcess[] {
  const map = new Map<string, AggregatedProcess>();

  for (const row of rows) {
    const key = row.imageName.toLowerCase();
    const existing = map.get(key);

    if (existing) {
      existing.totalMemKb += row.memUsageKb;
      existing.maxMemKb = Math.max(existing.maxMemKb, row.memUsageKb);
      existing.count++;
      existing.pids.push(row.pid);
    } else {
      map.set(key, {
        imageName: row.imageName,
        totalMemKb: row.memUsageKb,
        maxMemKb: row.memUsageKb,
        count: 1,
        pids: [row.pid],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalMemKb - a.totalMemKb);
}

function formatMb(kb: number): number {
  return Math.round(kb / 1024);
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function getLiveProcessHealth(): Promise<LiveProcessHealth[]> {
  const script = [
    "$first=@{}",
    "Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $first[$_.Id]=$_.CPU }",
    "Start-Sleep -Milliseconds 500",
    "$cores=[Environment]::ProcessorCount",
    "$connections=@{}",
    "Get-NetTCPConnection -ErrorAction SilentlyContinue | Group-Object OwningProcess | ForEach-Object { $connections[[int]$_.Name]=$_.Count }",
    "$rows=Get-Process -ErrorAction SilentlyContinue | ForEach-Object {",
    "  $before=$first[$_.Id]",
    "  $cpu=if($null -ne $before -and $null -ne $_.CPU){ [math]::Round((($_.CPU-$before)/0.5/$cores)*100,1) }else{ $null }",
    "  [pscustomobject]@{ProcessName=$_.ProcessName;Id=$_.Id;CpuPercent=$cpu;WorkingSet64=$_.WorkingSet64;Handles=$_.Handles;Responding=$_.Responding;StartTime=try{$_.StartTime.ToUniversalTime().ToString('o')}catch{$null};NetworkConnections=if($connections.ContainsKey($_.Id)){$connections[$_.Id]}else{0}}",
    "}",
    "$rows | ConvertTo-Json -Compress -Depth 3",
  ].join("; ");
  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { maxBuffer: 4 * 1024 * 1024 });
  return asArray(JSON.parse(stdout || "[]") as LiveProcessHealth[]);
}

async function getRecentAppEvents(): Promise<AppEvent[]> {
  const script = "$events=Get-WinEvent -FilterHashtable @{LogName='Application';Id=1000,1001,1002;StartTime=(Get-Date).AddHours(-24)} -MaxEvents 20 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Id,ProviderName,Message; $events | ConvertTo-Json -Compress -Depth 3";
  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { maxBuffer: 2 * 1024 * 1024 });
  return asArray(JSON.parse(stdout || "[]") as AppEvent[]);
}

function liveHealthFindings(rows: LiveProcessHealth[]): ScanFinding[] {
  const observedAt = new Date().toISOString();
  const findings: ScanFinding[] = [];
  const unresponsive = rows.filter((row) => row.Responding === false);
  for (const row of unresponsive.slice(0, 10)) {
    findings.push({
      category: "Apps",
      item: `${row.ProcessName || "Unknown process"} (${row.Id || "?"})`,
      status: "problem",
      health: "failed",
      confidence: 0.96,
      detector: "windows-responsiveness",
      evidence: [{ source: "Get-Process", signal: "responding", value: false, observedAt }],
      detail: "Windows reports that this application is not responding.",
      fix: "Wait briefly, save work if possible, then restart the application and inspect recent crash or hang events.",
    });
  }

  for (const row of rows.filter((item) => Number(item.CpuPercent || 0) >= 85).slice(0, 10)) {
    findings.push({
      category: "Apps",
      item: `${row.ProcessName || "Unknown process"} (${row.Id || "?"})`,
      status: "warning",
      health: "degraded",
      confidence: 0.84,
      detector: "cpu-sample",
      evidence: [{ source: "Get-Process", signal: "cpu-percent", value: row.CpuPercent, observedAt }],
      detail: `The process used approximately ${row.CpuPercent}% CPU during the sample window.`,
      fix: "Monitor whether CPU remains elevated and correlate it with the active task before ending the process.",
    });
  }

  for (const row of rows.filter((item) => Number(item.Handles || 0) >= 10000 || Number(item.NetworkConnections || 0) >= 200).slice(0, 10)) {
    findings.push({
      category: "Apps",
      item: `${row.ProcessName || "Unknown process"} (${row.Id || "?"})`,
      status: "warning",
      health: "degraded",
      confidence: 0.75,
      detector: "process-resource-shape",
      evidence: [
        { source: "Get-Process", signal: "handle-count", value: row.Handles || 0, observedAt },
        { source: "Get-NetTCPConnection", signal: "tcp-connection-count", value: row.NetworkConnections || 0, observedAt },
        { source: "Get-Process", signal: "start-time", value: row.StartTime || null, observedAt },
      ],
      detail: `The process has ${row.Handles || 0} handles and ${row.NetworkConnections || 0} TCP connection(s). This is abnormal enough to investigate, but must be compared with the app's normal workload.`,
      fix: "Watch whether handles or connections continue growing, then correlate with freezes, failed requests, and recent restarts.",
    });
  }
  return findings;
}

function eventFindings(events: AppEvent[]): ScanFinding[] {
  return events.slice(0, 10).map((event) => ({
    category: "Apps",
    item: `Recent Windows application event ${event.Id || ""}`.trim(),
    status: "warning",
    health: "degraded",
    confidence: 0.9,
    detector: "windows-application-log",
    evidence: [{
      source: event.ProviderName || "Windows Application Log",
      signal: "event-id",
      value: event.Id || null,
      observedAt: event.TimeCreated || new Date().toISOString(),
    }],
    detail: String(event.Message || "Application crash, hang, or error event recorded.").split(/\r?\n/)[0].slice(0, 500),
    fix: "Match the event time and process name to the application that failed, then inspect the associated faulting module.",
  }));
}

function classifyAggregatedProcess(agg: AggregatedProcess): ScanFinding {
  const totalMb = formatMb(agg.totalMemKb);
  const maxMb = formatMb(agg.maxMemKb);
  const friendlyName = getFriendlyProcessName(agg.imageName);
  const instanceLabel = agg.count > 1 ? ` (${agg.count} instances)` : "";

  const instanceThreshold =
    INSTANCE_WARN_THRESHOLD[agg.imageName] ?? DEFAULT_INSTANCE_WARN;
  const tooManyInstances = agg.count > instanceThreshold;
  const baseline = processBaselines.get(agg.imageName.toLowerCase());
  const baselineRatio = baseline && baseline.samples >= 2 && baseline.averageKb > 0
    ? agg.totalMemKb / baseline.averageKb
    : null;
  const abnormalGrowth = baselineRatio !== null && baselineRatio >= 2.5;

  const instanceNote = tooManyInstances
    ? ` Unusually high instance count (${agg.count}).`
    : "";

  const memDetail =
    agg.count > 1
      ? `Total memory: ${totalMb} MB across ${agg.count} instances. Largest instance: ${maxMb} MB.`
      : `Memory: ${totalMb} MB.`;

  if (abnormalGrowth || tooManyInstances || agg.totalMemKb >= 800_000) {
    return {
      category: "Apps",
      item: `${friendlyName}${instanceLabel}`,
      status: "warning",
      health: "degraded",
      confidence: abnormalGrowth ? 0.86 : tooManyInstances ? 0.72 : 0.58,
      detector: abnormalGrowth ? "memory-baseline" : "resource-observation",
      evidence: [{
        source: "tasklist",
        signal: abnormalGrowth ? "memory-vs-baseline" : "total-memory-mb",
        value: abnormalGrowth ? Number(baselineRatio?.toFixed(2)) : totalMb,
        observedAt: new Date().toISOString(),
      }],
      detail: `${memDetail}${instanceNote}${abnormalGrowth ? ` Memory is ${baselineRatio?.toFixed(1)}× this session's baseline.` : " High memory alone does not prove the app is broken."}`,
      fix: "Correlate this observation with responsiveness, CPU, crash events, and memory growth before restarting the application.",
    };
  }

  if (agg.totalMemKb >= 300_000) {
    return {
      category: "Apps",
      item: `${friendlyName}${instanceLabel}`,
      status: "warning",
      health: "detected",
      confidence: 0.55,
      detector: "resource-observation",
      detail: memDetail,
      fix: "Monitor usage. Close unnecessary instances or restart the app if performance feels degraded.",
    };
  }

  return {
    category: "Apps",
    item: `${friendlyName}${instanceLabel}`,
    status: "good",
    health: "detected",
    confidence: 0.7,
    detector: "process-inventory",
    detail: memDetail,
    fix: "No action needed.",
  };
}

function buildRecommendations(findings: ScanFinding[]): string[] {
  const recommendations: string[] = [];
  const problemCount = findings.filter((f) => f.status === "problem").length;
  const warningCount = findings.filter((f) => f.status === "warning").length;
  const hasVsCode = findings.some((f) => f.item.includes("Visual Studio Code"));
  const hasBrowser = findings.some(
    (f) => f.item.includes("Microsoft Edge") || f.item.includes("Google Chrome"),
  );

  if (problemCount > 0) {
    recommendations.push(
      "Review processes marked as problems. Confirm whether high memory or instance counts are expected.",
    );
    recommendations.push(
      "Close non-essential high-memory applications and re-run the scan to verify pressure is reduced.",
    );
  }

  if (warningCount > 0) {
    recommendations.push(
      "Watch elevated-memory processes for growth over time or recurring instability.",
    );
  }

  if (hasVsCode) {
    recommendations.push(
      "If VS Code memory looks high, close unused windows, folders, terminals, or extensions.",
    );
  }

  if (hasBrowser) {
    recommendations.push(
      "If browser memory looks high, close unused tabs or disable resource-heavy extensions.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("No major application health concerns were flagged in this scan pass.");
  }

  return recommendations;
}

export async function scanApps(): Promise<ScanResult & { scope: "apps" }> {
  const logs: string[] = ["[APPS] Starting Windows process scan."];

  try {
    const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"]);
    const rows = parseTasklistCsv(stdout);

    logs.push(`[APPS] Parsed ${rows.length} raw process entries.`);

    const aggregated = aggregateProcesses(rows);
    const top30 = aggregated.slice(0, 30);
    const findings = top30.map(classifyAggregatedProcess);
    for (const process of aggregated) {
      const key = process.imageName.toLowerCase();
      const previous = processBaselines.get(key);
      processBaselines.set(key, previous
        ? {
            samples: Math.min(previous.samples + 1, 20),
            averageKb: previous.averageKb * 0.8 + process.totalMemKb * 0.2,
          }
        : { samples: 1, averageKb: process.totalMemKb });
    }

    try {
      const [liveRows, appEvents] = await Promise.all([
        getLiveProcessHealth(),
        getRecentAppEvents(),
      ]);
      findings.unshift(...eventFindings(appEvents), ...liveHealthFindings(liveRows));
      logs.push(`[APPS] Added live responsiveness/CPU evidence for ${liveRows.length} process(es).`);
      logs.push(`[APPS] Added ${appEvents.length} recent Windows crash/hang event(s).`);
    } catch (error) {
      logs.push(`[APPS] Advanced Windows telemetry unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
      findings.unshift({
        category: "Apps",
        item: "Advanced application telemetry",
        status: "warning",
        health: "not_tested",
        confidence: 0.98,
        detector: "coverage-check",
        detail: "Process responsiveness, CPU sampling, or Windows crash-event inspection could not be completed.",
        fix: "Review app permissions and Windows Event Log access, then re-run the scan.",
      });
    }

    const memoryPressure = 1 - os.freemem() / os.totalmem();
    findings.unshift({
      category: "Apps",
      item: "System memory pressure",
      status: memoryPressure >= 0.9 ? "problem" : memoryPressure >= 0.8 ? "warning" : "good",
      health: memoryPressure >= 0.9 ? "failed" : memoryPressure >= 0.8 ? "degraded" : "healthy",
      confidence: 0.95,
      detector: "system-memory",
      evidence: [{ source: "os", signal: "memory-used-percent", value: Math.round(memoryPressure * 100), observedAt: new Date().toISOString() }],
      detail: `${Math.round(memoryPressure * 100)}% of physical memory is currently in use.`,
      fix: memoryPressure >= 0.8 ? "Close unnecessary applications and identify processes whose memory continues to grow." : "No action needed.",
    });

    const problemCount = findings.filter((f) => f.status === "problem").length;
    const warningCount = findings.filter((f) => f.status === "warning").length;

    logs.push(`[APPS] Aggregated into ${aggregated.length} unique processes.`);
    logs.push(`[APPS] Top 30 by total memory analyzed.`);
    logs.push(`[APPS] ${problemCount} problems, ${warningCount} warnings detected.`);

    return {
      scope: "apps",
      summary: `Scanned ${rows.length} processes (${aggregated.length} unique). ${problemCount} problem(s), ${warningCount} warning(s) in top 30 by total memory.`,
      findings,
      logs,
      recommendations: buildRecommendations(findings),
      scannedAt: new Date().toISOString(),
      meta: {
        totalProcesses: rows.length,
        uniqueProcesses: aggregated.length,
        analyzedProcesses: top30.length,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown process scan failure.";

    logs.push("[APPS] Process scan failed.");
    logs.push(`[APPS] Error: ${message}`);

    return {
      scope: "apps",
      summary: "Application scan failed.",
      findings: [
        {
          category: "Apps",
          item: "Process enumeration",
          status: "problem",
          detail: message,
          fix: "Ensure system permissions allow process inspection and retry.",
        },
      ],
      logs,
      recommendations: [
        "Verify the app has permission to run local diagnostics.",
        "Confirm the Windows tasklist command is available and try again.",
      ],
      scannedAt: new Date().toISOString(),
    };
  }
}
