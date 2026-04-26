import fs from "node:fs/promises";
import path from "node:path";

type ScanStatus = "good" | "warning" | "problem";

type ScanFinding = {
  category: string;
  item: string;
  status: ScanStatus;
  detail: string;
  fix: string;
};

type ScanResult = {
  scope: "files";
  summary: string;
  findings: ScanFinding[];
  logs: string[];
  recommendations: string[];
  scannedAt: string;
  meta?: Record<string, unknown>;
};

const MAX_ENTRIES = 75;
const WARNING_EXTENSIONS = new Set([".log", ".tmp", ".bak", ".old"]);

function shouldWarnByExtension(extension: string): boolean {
  return WARNING_EXTENSIONS.has(extension.toLowerCase());
}

function buildRecommendations(findings: ScanFinding[], resolvedDir: string): string[] {
  const recommendations: string[] = [];
  const hasProblem = findings.some((item) => item.status === "problem");
  const hasWarning = findings.some((item) => item.status === "warning");

  if (hasProblem) {
    recommendations.push(
      `Review unreadable or inaccessible entries inside ${resolvedDir} and confirm permissions are correct.`,
    );
  }

  if (hasWarning) {
    recommendations.push(
      "Review empty files and temporary/log/backup files to confirm they are expected for this target folder.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("No immediate file-health concerns were detected in this scan pass.");
  }

  return recommendations;
}

export async function scanFiles(dir?: string): Promise<ScanResult> {
  const scanTarget = dir?.trim() || process.cwd();
  const logs: string[] = [`[FILES] Starting file scan for ${scanTarget}`];
  const findings: ScanFinding[] = [];

  try {
    const resolvedDir = path.resolve(scanTarget);
    const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
    const limitedEntries = entries.slice(0, MAX_ENTRIES);

    logs.push(`[FILES] Evaluating ${limitedEntries.length} entries from ${resolvedDir}.`);

    for (const entry of limitedEntries) {
      const fullPath = path.join(resolvedDir, entry.name);

      try {
        const stats = await fs.stat(fullPath);

        if (entry.isDirectory()) {
          findings.push({
            category: "Files",
            item: entry.name,
            status: "good",
            detail: `Folder detected. Last modified ${stats.mtime.toLocaleString()}.`,
            fix: "No action needed."
          });
          continue;
        }

        const extension = path.extname(entry.name).toLowerCase();

        if (stats.size === 0) {
          findings.push({
            category: "Files",
            item: entry.name,
            status: "warning",
            detail: "File is empty.",
            fix: "Verify this file is expected. Remove or populate it if not needed."
          });
          continue;
        }

        if (shouldWarnByExtension(extension)) {
          findings.push({
            category: "Files",
            item: entry.name,
            status: "warning",
            detail: `Review file type ${extension || "(no extension)"} manually. Size ${stats.size} bytes.`,
            fix: "Review this file. Archive or delete it if it is no longer needed."
          });
          continue;
        }

        findings.push({
          category: "Files",
          item: entry.name,
          status: "good",
          detail: `Readable file. Size ${stats.size} bytes. Modified ${stats.mtime.toLocaleString()}.`,
          fix: "No action needed."
        });
      } catch (error) {
        findings.push({
          category: "Files",
          item: entry.name,
          status: "problem",
          detail:
            error instanceof Error ? error.message : "Unable to inspect this entry.",
            fix: "Check file permissions or ensure the file is not locked, missing, or corrupted."
        });
      }
    }

    const problemCount = findings.filter((item) => item.status === "problem").length;
    const warningCount = findings.filter((item) => item.status === "warning").length;

    logs.push(`[FILES] ${problemCount} problems, ${warningCount} warnings detected.`);

    return {
      scope: "files",
      summary: `Scanned ${limitedEntries.length} item(s) in ${resolvedDir}. ${problemCount} problem(s), ${warningCount} warning(s) detected.`,
      findings,
      logs,
      recommendations: buildRecommendations(findings, resolvedDir),
      scannedAt: new Date().toISOString(),
      meta: {
        scanTarget: resolvedDir,
        scannedEntries: limitedEntries.length,
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
          fix: "Confirm the target folder exists and that the app has permission to read it."
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
