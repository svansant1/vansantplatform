import { dialog, ipcMain } from "electron";
import { scanApps } from "../services/processService";
import { scanNetwork } from "../services/networkService";
import { scanFiles } from "../services/fileService";
import { scanSites } from "../services/siteService";

export function registerScanHandlers(): void {
  ipcMain.handle("scan:apps", async () => {
    return await scanApps();
  });

  ipcMain.handle("scan:network", async () => {
    return await scanNetwork();
  });

  ipcMain.handle("scan:files", async (_, dir?: string) => {
    return await scanFiles(dir);
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
}
