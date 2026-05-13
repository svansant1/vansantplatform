import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import type { ScanFinding, ScanResult } from "../../shared/types/scan";

const MAX_ENTRIES = 300;
const MAX_DEPTH = 3;
const MAX_FINDINGS = 120;
const LARGE_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
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
};

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
      status: "warning",
      detail: `Executable script file detected (${extension}). Size: ${sizeLabel}.`,
      fix: "Confirm this script is trusted and expected before running it.",
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
    };

    logs.push(
      `[FILES] Recursively scanning up to ${MAX_ENTRIES} entries and ${MAX_DEPTH} levels in ${resolvedDir}.`,
    );

    await walkDirectory(resolvedDir, resolvedDir, 0, findings, logs, stats);

    const problemCount = findings.filter((f) => f.status === "problem").length;
    const warningCount = findings.filter((f) => f.status === "warning").length;

    logs.push(
      `[FILES] Scanned ${stats.scannedFiles} files and ${stats.scannedDirectories} folders.`,
    );
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
