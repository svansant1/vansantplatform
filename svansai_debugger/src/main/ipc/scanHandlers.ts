import { dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import { scanApps } from "../services/processService";
import { scanNetwork } from "../services/networkService";
import { scanFiles } from "../services/fileService";
import { scanSites } from "../services/siteService";

const MAX_REPORT_BYTES = 2 * 1024 * 1024;
let handlersRegistered = false;

function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function sanitizeReportName(value: unknown): string {
  const raw =
    typeof value === "string" && value.trim()
      ? value.trim()
      : "svansai-scan-report.txt";

  const safe = raw
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();

  return safe.toLowerCase().endsWith(".txt")
    ? safe
    : `${safe || "svansai-scan-report"}.txt`;
}

function normalizeReportContent(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length > MAX_REPORT_BYTES
    ? value.slice(0, MAX_REPORT_BYTES)
    : value;
}

export function registerScanHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("scan:apps", async () => {
    return await scanApps();
  });

  ipcMain.handle("scan:network", async () => {
    return await scanNetwork();
  });

  ipcMain.handle("scan:files", async (_, dir?: unknown) => {
    return await scanFiles(normalizeOptionalString(dir, 2048));
  });

  ipcMain.handle("scan:sites", async () => {
    return await scanSites();
  });

  ipcMain.handle("dialog:pick-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select folder to scan",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(
    "export:save-report",
    async (_, content: unknown, defaultName: unknown) => {
      const safeContent = normalizeReportContent(content);
      const safeDefaultName = sanitizeReportName(defaultName);

      if (!safeContent.trim()) {
        return { ok: false, error: "Report content is empty." };
      }

      const result = await dialog.showSaveDialog({
        title: "Save Scan Report",
        defaultPath: safeDefaultName,
        filters: [
          { name: "Text files", extensions: ["txt"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { ok: false };
      }

      try {
        await fs.writeFile(result.filePath, safeContent, "utf-8");
        return { ok: true, filePath: result.filePath };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Write failed.",
        };
      }
    },
  );
}
