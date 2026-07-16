import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScanFinding, ScanResult } from "../../shared/types/scan";

const MAX_ENTRIES = 300;
const MAX_DEPTH = 3;
const MAX_FINDINGS = 120;
const LARGE_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const CONTENT_SCAN_MAX_BYTES = 2 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const WARNING_EXTENSIONS = new Set([".log", ".tmp", ".bak", ".old"]);
const SCRIPT_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".ps1",
  ".vbs",
  ".js",
  ".jse",
  ".wsf",
]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "dist",
  "node_modules",
  "out",
  "release",
  "venv",
]);

type FileScanStats = {
  scannedEntries: number;
  scannedFiles: number;
  scannedDirectories: number;
  skippedDirectories: number;
  skippedEntries: number;
  unreadableEntries: number;
  limitHit: boolean;
  contentInspected: number;
  invalidContent: number;
};

type PhysicalDiskHealth = {
  FriendlyName?: string;
  HealthStatus?: string;
  OperationalStatus?: string | string[];
};

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function getPhysicalDiskHealth(): Promise<PhysicalDiskHealth[]> {
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-PhysicalDisk -ErrorAction Stop | Select-Object FriendlyName,HealthStatus,OperationalStatus | ConvertTo-Json -Compress -Depth 3",
  ]);
  return asArray(JSON.parse(stdout || "[]") as PhysicalDiskHealth[]);
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function getRelativeLabel(resolvedDir: string, fullPath: string): string {
  const relative = path.relative(resolvedDir, fullPath);
  return relative || path.basename(fullPath);
}

function shouldSkipDirectory(name: string): boolean {
  return SKIPPED_DIRECTORIES.has(name.toLowerCase());
}

function shouldWarnByExtension(extension: string): boolean {
  return WARNING_EXTENSIONS.has(extension.toLowerCase());
}

function isScriptFile(extension: string): boolean {
  return SCRIPT_EXTENSIONS.has(extension.toLowerCase());
}

function prioritizeFinding(finding: ScanFinding): number {
  if (finding.status === "problem") return 0;
  if (finding.status === "warning") return 1;
  return 2;
}

function addFinding(findings: ScanFinding[], finding: ScanFinding): void {
  findings.push(finding);
  findings.sort((a, b) => prioritizeFinding(a) - prioritizeFinding(b));
  if (findings.length > MAX_FINDINGS) {
    findings.pop();
  }
}

async function listEntries(dir: string): Promise<Dirent[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
}

function classifyFile(
  resolvedDir: string,
  fullPath: string,
  stats: Awaited<ReturnType<typeof fs.stat>>,
): ScanFinding {
  const item = getRelativeLabel(resolvedDir, fullPath);
  const extension = path.extname(fullPath).toLowerCase();
  const sizeLabel = formatFileSize(stats.size);

  if (stats.size === 0) {
    return {
      category: "Files",
      item,
      status: "warning",
      detail: "File is empty (0 bytes).",
      fix: "Verify this file is expected. Remove or populate it if it is not needed.",
    };
  }

  if (stats.size >= LARGE_FILE_BYTES) {
    return {
      category: "Files",
      item,
      status: "warning",
      detail: `Large file detected: ${sizeLabel}. Modified ${stats.mtime.toLocaleString()}.`,
      fix: "Confirm this large file is needed here. Consider archiving or relocating it.",
    };
  }

  if (shouldWarnByExtension(extension)) {
    return {
      category: "Files",
      item,
      status: "warning",
      detail: `Temporary, log, or backup file type (${extension || "no extension"}). Size: ${sizeLabel}.`,
      fix: "Review this file. Archive or delete it if it is no longer needed.",
    };
  }

  if (isScriptFile(extension)) {
    return {
      category: "Files",
      item,
      status: "good",
      health: "detected",
      confidence: 0.99,
      detector: "file-type-inventory",
      detail: `Script file detected (${extension}). Size: ${sizeLabel}. Its presence alone does not indicate a problem.`,
      fix: "No action needed.",
    };
  }

  return {
    category: "Files",
    item,
    status: "good",
    detail: `Readable file. Size: ${sizeLabel}. Modified ${stats.mtime.toLocaleString()}.`,
    fix: "No action needed.",
  };
}

function hasExpectedSignature(extension: string, buffer: Buffer): boolean | null {
  const hex = buffer.subarray(0, 8).toString("hex").toLowerCase();
  if ([".zip", ".docx", ".xlsx", ".pptx", ".jar"].includes(extension)) {
    return hex.startsWith("504b0304") || hex.startsWith("504b0506") || hex.startsWith("504b0708");
  }
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") return hex.startsWith("89504e470d0a1a0a");
  if ([".jpg", ".jpeg"].includes(extension)) return hex.startsWith("ffd8ff");
  if (extension === ".gif") return buffer.subarray(0, 6).toString("ascii").startsWith("GIF8");
  return null;
}

async function inspectFileContent(
  resolvedDir: string,
  fullPath: string,
  size: number,
  stats: FileScanStats,
): Promise<ScanFinding[]> {
  if (size <= 0 || size > CONTENT_SCAN_MAX_BYTES) return [];
  const extension = path.extname(fullPath).toLowerCase();
  const item = getRelativeLabel(resolvedDir, fullPath);
  const observedAt = new Date().toISOString();
  const findings: ScanFinding[] = [];

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(fullPath);
    stats.contentInspected++;
  } catch (error) {
    stats.invalidContent++;
    return [{
      category: "Files",
      item,
      status: "problem",
      health: "failed",
      confidence: 0.98,
      detector: "content-readability",
      evidence: [{ source: "filesystem", signal: "content-read-error", value: error instanceof Error ? error.message : "read failed", observedAt }],
      detail: "The file metadata was readable, but its contents could not be opened.",
      fix: "Check file permissions, locks, synchronization status, and disk health.",
    }];
  }

  const signatureOk = hasExpectedSignature(extension, buffer);
  if (signatureOk === false) {
    stats.invalidContent++;
    findings.push({
      category: "Files",
      item,
      status: "problem",
      health: "failed",
      confidence: 0.98,
      detector: "file-signature",
      evidence: [{ source: "file-header", signal: "signature-valid", value: false, observedAt }],
      detail: `The file contents do not match the expected ${extension} signature. It may be corrupted or incorrectly named.`,
      fix: "Restore the file from a known-good copy or verify its true format before opening it.",
    });
  }

  if (extension === ".json") {
    try {
      const parsed = JSON.parse(buffer.toString("utf8")) as Record<string, unknown>;
      if (path.basename(fullPath).toLowerCase() === "package.json") {
        const dependencies = {
          ...(typeof parsed.dependencies === "object" && parsed.dependencies ? parsed.dependencies as Record<string, unknown> : {}),
          ...(typeof parsed.devDependencies === "object" && parsed.devDependencies ? parsed.devDependencies as Record<string, unknown> : {}),
        };
        const missing: string[] = [];
        for (const dependency of Object.keys(dependencies).slice(0, 200)) {
          try {
            await fs.access(path.join(path.dirname(fullPath), "node_modules", dependency));
          } catch {
            missing.push(dependency);
          }
        }
        if (Object.keys(dependencies).length > 0 && missing.length > 0) {
          findings.push({
            category: "Files",
            item,
            status: "warning",
            health: "degraded",
            confidence: 0.9,
            detector: "node-dependency-check",
            evidence: [{ source: "package.json", signal: "missing-dependency-count", value: missing.length, observedAt }],
            detail: `${missing.length} declared Node dependency folder(s) are missing, including ${missing.slice(0, 5).join(", ")}.`,
            fix: "Run the project's package-manager install command and then re-run its build or tests.",
          });
        }
      }
    } catch (error) {
      stats.invalidContent++;
      findings.push({
        category: "Files",
        item,
        status: "problem",
        health: "failed",
        confidence: 0.99,
        detector: "json-parser",
        evidence: [{ source: "JSON.parse", signal: "valid", value: false, observedAt }],
        detail: `Invalid JSON: ${error instanceof Error ? error.message : "parsing failed"}`,
        fix: "Correct the JSON syntax and validate the file again.",
      });
    }
  }

  if ([".log", ".txt"].includes(extension)) {
    const text = buffer.toString("utf8");
    const errorMatches = text.match(/\b(error|fatal|exception|unhandled|crash(?:ed)?|failed)\b/gi) || [];
    if (errorMatches.length > 0) {
      findings.push({
        category: "Files",
        item,
        status: "warning",
        health: "degraded",
        confidence: 0.78,
        detector: "log-error-signatures",
        evidence: [{ source: "log-parser", signal: "error-signature-count", value: errorMatches.length, observedAt }],
        detail: `${errorMatches.length} error-related signature(s) were found. The count is evidence for review, not proof that every entry is an active failure.`,
        fix: "Correlate log timestamps and repeated signatures with the time the application malfunctioned.",
      });
    }
  }

  if (extension === ".env" || path.basename(fullPath).toLowerCase().startsWith(".env.")) {
    const lines = buffer.toString("utf8").split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
    const malformed = lines.filter((line) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line));
    const emptyValues = lines.filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=\s*$/.test(line));
    if (malformed.length > 0 || emptyValues.length > 0) {
      findings.push({
        category: "Files",
        item,
        status: "warning",
        health: "degraded",
        confidence: 0.88,
        detector: "environment-config",
        evidence: [
          { source: "env-parser", signal: "malformed-lines", value: malformed.length, observedAt },
          { source: "env-parser", signal: "empty-values", value: emptyValues.length, observedAt },
        ],
        detail: `Environment configuration contains ${malformed.length} malformed line(s) and ${emptyValues.length} empty value(s). Values were not collected.`,
        fix: "Correct the variable formatting and confirm required values are present without exposing secrets.",
      });
    }
  }

  return findings;
}

async function walkDirectory(
  resolvedDir: string,
  currentDir: string,
  depth: number,
  findings: ScanFinding[],
  logs: string[],
  stats: FileScanStats,
): Promise<void> {
  if (stats.scannedEntries >= MAX_ENTRIES) {
    stats.limitHit = true;
    return;
  }

  let entries: Dirent[];
  try {
    entries = await listEntries(currentDir);
  } catch (error) {
    stats.unreadableEntries++;
    addFinding(findings, {
      category: "Files",
      item: getRelativeLabel(resolvedDir, currentDir),
      status: "problem",
      detail:
        error instanceof Error ? error.message : "Unable to read this folder.",
      fix: "Check folder permissions or whether the folder is locked or missing.",
    });
    return;
  }

  for (const entry of entries) {
    if (stats.scannedEntries >= MAX_ENTRIES) {
      stats.limitHit = true;
      break;
    }

    const fullPath = path.join(currentDir, entry.name);
    const relativeLabel = getRelativeLabel(resolvedDir, fullPath);

    if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
      stats.skippedDirectories++;
      logs.push(`[FILES] Skipped noisy folder: ${relativeLabel}`);
      continue;
    }

    stats.scannedEntries++;

    try {
      const entryStats = await fs.stat(fullPath);

      if (entry.isDirectory()) {
        stats.scannedDirectories++;

        if (depth >= MAX_DEPTH) {
          stats.skippedEntries++;
          continue;
        }

        await walkDirectory(
          resolvedDir,
          fullPath,
          depth + 1,
          findings,
          logs,
          stats,
        );
        continue;
      }

      if (!entry.isFile()) {
        stats.skippedEntries++;
        continue;
      }

      stats.scannedFiles++;
      addFinding(findings, classifyFile(resolvedDir, fullPath, entryStats));
      const contentFindings = await inspectFileContent(
        resolvedDir,
        fullPath,
        entryStats.size,
        stats,
      );
      for (const finding of contentFindings) addFinding(findings, finding);
    } catch (error) {
      stats.unreadableEntries++;
      addFinding(findings, {
        category: "Files",
        item: relativeLabel,
        status: "problem",
        detail:
          error instanceof Error
            ? error.message
            : "Unable to inspect this entry.",
        fix: "Check file permissions or ensure the file is not locked, missing, or corrupted.",
      });
    }
  }
}

function buildRecommendations(
  findings: ScanFinding[],
  resolvedDir: string,
  stats: FileScanStats,
): string[] {
  const recommendations: string[] = [];
  const hasProblem = findings.some((f) => f.status === "problem");
  const hasWarning = findings.some((f) => f.status === "warning");
  const hasLargeFiles = findings.some((f) => f.detail.includes("Large file"));
  const hasScripts = findings.some((f) => f.detail.includes("Executable script"));

  if (hasProblem) {
    recommendations.push(
      `Review unreadable or inaccessible entries inside ${resolvedDir} and confirm permissions are correct.`,
    );
  }

  if (hasWarning) {
    recommendations.push(
      "Review empty, temporary, log, backup, large, and executable script files to confirm they are expected.",
    );
  }

  if (hasLargeFiles) {
    recommendations.push(
      "One or more files exceed 100 MB. Confirm they are necessary or move them to archive storage.",
    );
  }

  if (hasScripts) {
    recommendations.push(
      "Script files were detected. Only run scripts that came from a trusted source and that you understand.",
    );
  }

  if (stats.limitHit) {
    recommendations.push(
      `This scan stopped after ${MAX_ENTRIES} entries. Narrow the target folder for a more complete pass.`,
    );
  }

  if (stats.skippedDirectories > 0) {
    recommendations.push(
      "Dependency and build-output folders were skipped to keep the scan focused and fast.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "No immediate file-health concerns were detected in this scan pass.",
    );
  }

  return recommendations;
}

export async function scanFiles(
  dir?: string,
): Promise<ScanResult & { scope: "files" }> {
  const scanTarget = dir?.trim() || process.cwd();
  const logs: string[] = [`[FILES] Starting file scan for ${scanTarget}`];
  const findings: ScanFinding[] = [];

  try {
    const resolvedDir = path.resolve(scanTarget);
    const rootStats = await fs.stat(resolvedDir);

    if (!rootStats.isDirectory()) {
      return {
        scope: "files",
        summary: "File scan target is not a folder.",
        findings: [
          {
            category: "Files",
            item: resolvedDir,
            status: "problem",
            detail: "The selected target is not a directory.",
            fix: "Choose a folder to scan.",
          },
        ],
        logs,
        recommendations: ["Choose a folder to scan."],
        scannedAt: new Date().toISOString(),
      };
    }

    const stats: FileScanStats = {
      scannedEntries: 0,
      scannedFiles: 0,
      scannedDirectories: 0,
      skippedDirectories: 0,
      skippedEntries: 0,
      unreadableEntries: 0,
      limitHit: false,
      contentInspected: 0,
      invalidContent: 0,
    };

    logs.push(
      `[FILES] Recursively scanning up to ${MAX_ENTRIES} entries and ${MAX_DEPTH} levels in ${resolvedDir}.`,
    );

    await walkDirectory(resolvedDir, resolvedDir, 0, findings, logs, stats);

    try {
      const disk = await fs.statfs(resolvedDir);
      const totalBytes = Number(disk.blocks) * Number(disk.bsize);
      const freeBytes = Number(disk.bavail) * Number(disk.bsize);
      const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;
      findings.unshift({
        category: "Files",
        item: "Disk free space",
        status: freePercent < 5 ? "problem" : freePercent < 15 ? "warning" : "good",
        health: freePercent < 5 ? "failed" : freePercent < 15 ? "degraded" : "healthy",
        confidence: 0.99,
        detector: "filesystem-capacity",
        evidence: [{ source: "statfs", signal: "free-percent", value: Number(freePercent.toFixed(1)), observedAt: new Date().toISOString() }],
        detail: `${freePercent.toFixed(1)}% of the target filesystem is free.`,
        fix: freePercent < 15 ? "Free disk space before applications fail to write caches, logs, updates, or user files." : "No action needed.",
      });
    } catch (error) {
      logs.push(`[FILES] Disk-capacity check unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    try {
      const physicalDisks = await getPhysicalDiskHealth();
      for (const disk of physicalDisks) {
        const healthy = String(disk.HealthStatus || "").toLowerCase() === "healthy";
        findings.unshift({
          category: "Files",
          item: `Physical disk: ${disk.FriendlyName || "Unknown"}`,
          status: healthy ? "good" : "warning",
          health: healthy ? "healthy" : "degraded",
          confidence: 0.96,
          detector: "windows-storage-health",
          evidence: [
            { source: "Get-PhysicalDisk", signal: "health-status", value: disk.HealthStatus || "Unknown", observedAt: new Date().toISOString() },
            { source: "Get-PhysicalDisk", signal: "operational-status", value: Array.isArray(disk.OperationalStatus) ? disk.OperationalStatus.join(", ") : disk.OperationalStatus || "Unknown", observedAt: new Date().toISOString() },
          ],
          detail: `Windows reports health=${disk.HealthStatus || "Unknown"}, operational=${Array.isArray(disk.OperationalStatus) ? disk.OperationalStatus.join(", ") : disk.OperationalStatus || "Unknown"}.`,
          fix: healthy ? "No action needed." : "Back up important data and run the manufacturer's storage diagnostics before relying on the disk.",
        });
      }
    } catch (error) {
      findings.unshift({
        category: "Files",
        item: "Physical disk health coverage",
        status: "warning",
        health: "not_tested",
        confidence: 0.98,
        detector: "coverage-check",
        detail: "Windows physical-disk health information was unavailable.",
        fix: "Run the debugger with access to Windows storage health APIs or use the drive manufacturer's diagnostic utility.",
      });
      logs.push(`[FILES] Physical-disk health check unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    const problemCount = findings.filter((f) => f.status === "problem").length;
    const warningCount = findings.filter((f) => f.status === "warning").length;

    logs.push(
      `[FILES] Scanned ${stats.scannedFiles} files and ${stats.scannedDirectories} folders.`,
    );
    logs.push(`[FILES] Inspected contents of ${stats.contentInspected} file(s); ${stats.invalidContent} invalid/corrupt indicator(s).`);
    logs.push(
      `[FILES] Skipped ${stats.skippedDirectories} noisy folders and ${stats.skippedEntries} entries outside scan depth/type.`,
    );
    logs.push(`[FILES] ${problemCount} problems, ${warningCount} warnings detected.`);

    return {
      scope: "files",
      summary: `Scanned ${stats.scannedFiles} file(s) and ${stats.scannedDirectories} folder(s) in ${resolvedDir}. ${problemCount} problem(s), ${warningCount} warning(s) detected.${stats.limitHit ? ` Stopped at the ${MAX_ENTRIES}-entry limit.` : ""}`,
      findings,
      logs,
      recommendations: buildRecommendations(findings, resolvedDir, stats),
      scannedAt: new Date().toISOString(),
      meta: {
        scanTarget: resolvedDir,
        maxDepth: MAX_DEPTH,
        maxEntries: MAX_ENTRIES,
        scannedEntries: stats.scannedEntries,
        scannedFiles: stats.scannedFiles,
        scannedDirectories: stats.scannedDirectories,
        skippedDirectories: stats.skippedDirectories,
        skippedEntries: stats.skippedEntries,
        unreadableEntries: stats.unreadableEntries,
        limitHit: stats.limitHit,
        contentInspected: stats.contentInspected,
        invalidContent: stats.invalidContent,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown file scan failure.";

    logs.push("[FILES] File scan failed.");
    logs.push(`[FILES] Error: ${message}`);

    return {
      scope: "files",
      summary: "File scan failed.",
      findings: [
        {
          category: "Files",
          item: scanTarget,
          status: "problem",
          detail: message,
          fix: "Confirm the target folder exists and that the app has permission to read it.",
        },
      ],
      logs,
      recommendations: [
        "Confirm the target folder exists and that the app has permission to read it.",
      ],
      scannedAt: new Date().toISOString(),
    };
  }
}
