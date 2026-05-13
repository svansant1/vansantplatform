import { execFile } from "node:child_process";
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

function classifyAggregatedProcess(agg: AggregatedProcess): ScanFinding {
  const totalMb = formatMb(agg.totalMemKb);
  const maxMb = formatMb(agg.maxMemKb);
  const friendlyName = getFriendlyProcessName(agg.imageName);
  const instanceLabel = agg.count > 1 ? ` (${agg.count} instances)` : "";

  const instanceThreshold =
    INSTANCE_WARN_THRESHOLD[agg.imageName] ?? DEFAULT_INSTANCE_WARN;
  const tooManyInstances = agg.count > instanceThreshold;

  const instanceNote = tooManyInstances
    ? ` Unusually high instance count (${agg.count}).`
    : "";

  const memDetail =
    agg.count > 1
      ? `Total memory: ${totalMb} MB across ${agg.count} instances. Largest instance: ${maxMb} MB.`
      : `Memory: ${totalMb} MB.`;

  if (agg.totalMemKb >= 800_000 || tooManyInstances) {
    return {
      category: "Apps",
      item: `${friendlyName}${instanceLabel}`,
      status: "problem",
      detail: `${memDetail}${instanceNote}`,
      fix: "Close or restart this application. Check for memory leaks, too many open instances, or reinstall if the issue persists.",
    };
  }

  if (agg.totalMemKb >= 300_000) {
    return {
      category: "Apps",
      item: `${friendlyName}${instanceLabel}`,
      status: "warning",
      detail: memDetail,
      fix: "Monitor usage. Close unnecessary instances or restart the app if performance feels degraded.",
    };
  }

  return {
    category: "Apps",
    item: `${friendlyName}${instanceLabel}`,
    status: "good",
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
