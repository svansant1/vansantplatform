import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ScanStatus = "good" | "warning" | "problem";

type ScanFinding = {
  category: string;
  item: string;
  status: ScanStatus;
  detail: string;
  fix: string;
};

type ScanResult = {
  scope: "apps";
  summary: string;
  findings: ScanFinding[];
  logs: string[];
  recommendations: string[];
  scannedAt: string;
  meta?: Record<string, unknown>;
};

type TaskListRow = {
  imageName: string;
  pid: number;
  sessionName: string;
  sessionNumber: number;
  memUsageKb: number;
};

const PROCESS_LABELS: Record<string, string> = {
  "Code.exe": "Visual Studio Code",
  "msedge.exe": "Microsoft Edge",
  "chrome.exe": "Google Chrome",
  "python.exe": "Python",
  "pythonw.exe": "Python",
  "node.exe": "Node.js",
  "explorer.exe": "Windows Explorer",
  "cmd.exe": "Command Prompt",
  "powershell.exe": "PowerShell",
  "pwsh.exe": "PowerShell",
  "WindowsTerminal.exe": "Windows Terminal",
  "SearchIndexer.exe": "Windows Search Indexer",
  "Taskmgr.exe": "Task Manager",
  "svchost.exe": "Windows Service Host",
};

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

function formatMemoryMb(memUsageKb: number): number {
  return Math.round(memUsageKb / 1024);
}

function buildProcessLabel(row: TaskListRow): string {
  return getFriendlyProcessName(row.imageName);
}

function getProcessDetail(row: TaskListRow, memoryMb: number): string {
  const friendlyName = getFriendlyProcessName(row.imageName);
  const technicalInfo = `Process: ${row.imageName} | PID: ${row.pid} | Session: ${row.sessionName} | Memory: ${memoryMb} MB.`;

  if (row.imageName === "Code.exe") {
    return `${friendlyName} is running. This is likely one of your open VS Code windows or workspaces. ${technicalInfo}`;
  }

  if (row.imageName === "msedge.exe") {
    return `${friendlyName} is active. This may represent one of your browser windows, tabs, extensions, or browser services. ${technicalInfo}`;
  }

  if (row.imageName === "chrome.exe") {
    return `${friendlyName} is active. This may represent one of your browser windows, tabs, extensions, or browser services. ${technicalInfo}`;
  }

  if (row.imageName === "node.exe") {
    return `${friendlyName} is active. This often means a dev server, build tool, or local app runtime is running. ${technicalInfo}`;
  }

  if (row.imageName === "python.exe" || row.imageName === "pythonw.exe") {
    return `${friendlyName} is active. This often means a backend, script, or automation process is running. ${technicalInfo}`;
  }

  return `${friendlyName} is running normally. ${technicalInfo}`;
}

function classifyProcess(row: TaskListRow): ScanFinding {
  const memoryMb = formatMemoryMb(row.memUsageKb);
  const itemLabel = buildProcessLabel(row);

  if (row.memUsageKb >= 800_000) {
    return {
      category: "Apps",
      item: itemLabel,
      status: "problem",
      detail: `Very high memory usage detected: ${memoryMb} MB. ${getProcessDetail(row, memoryMb)}`,
      fix: "Close or restart this application. Check for memory leaks, too many open instances, or reinstall if the issue keeps returning.",
    };
  }

  if (row.memUsageKb >= 300_000) {
    return {
      category: "Apps",
      item: itemLabel,
      status: "warning",
      detail: `Elevated memory usage detected: ${memoryMb} MB. ${getProcessDetail(row, memoryMb)}`,
      fix: "Monitor usage. Close unnecessary instances, reduce workload, or restart the app if performance feels degraded.",
    };
  }

  return {
    category: "Apps",
    item: itemLabel,
    status: "good",
    detail: getProcessDetail(row, memoryMb),
    fix: "No action needed.",
  };
}

function buildRecommendations(findings: ScanFinding[]): string[] {
  const recommendations: string[] = [];
  const problemCount = findings.filter((item) => item.status === "problem").length;
  const warningCount = findings.filter((item) => item.status === "warning").length;
  const hasVsCode = findings.some((item) => item.item.includes("Visual Studio Code"));
  const hasBrowser = findings.some((item) => item.item.includes("Microsoft Edge") || item.item.includes("Google Chrome"));

  if (problemCount > 0) {
    recommendations.push(
      "Review the processes marked as problems and confirm whether their memory footprint is expected.",
    );
    recommendations.push(
      "Close non-essential high-memory applications and re-run the scan to verify whether pressure is reduced.",
    );
  }

  if (warningCount > 0) {
    recommendations.push(
      "Watch elevated-memory processes for growth over time or recurring instability.",
    );
  }

  if (hasVsCode) {
    recommendations.push(
      "If Visual Studio Code usage looks high, close unused windows, folders, terminals, or extensions and scan again.",
    );
  }

  if (hasBrowser) {
    recommendations.push(
      "If browser usage looks high, close unused tabs or extensions and re-check app memory pressure.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("No major application health concerns were flagged in this scan pass.");
  }

  return recommendations;
}

export async function scanApps(): Promise<ScanResult> {
  const logs: string[] = ["[APPS] Starting Windows process scan."];

  try {
    const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"]);
    const rows = parseTasklistCsv(stdout);

    logs.push(`[APPS] Parsed ${rows.length} running processes.`);

    const sortedRows = rows.sort((a, b) => b.memUsageKb - a.memUsageKb);
    const topRows = sortedRows.slice(0, 30);
    const findings = topRows.map(classifyProcess);

    const problemCount = findings.filter((item) => item.status === "problem").length;
    const warningCount = findings.filter((item) => item.status === "warning").length;

    logs.push(`[APPS] Top ${topRows.length} processes analyzed by memory usage.`);
    logs.push(`[APPS] ${problemCount} problems, ${warningCount} warnings detected.`);

    return {
      scope: "apps",
      summary: `Scanned ${rows.length} running processes. ${problemCount} problem(s), ${warningCount} warning(s) detected in the top 30 by memory usage.`,
      findings,
      logs,
      recommendations: buildRecommendations(findings),
      scannedAt: new Date().toISOString(),
      meta: {
        totalProcesses: rows.length,
        analyzedProcesses: topRows.length,
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