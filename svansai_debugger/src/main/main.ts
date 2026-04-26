import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerScanHandlers } from "./ipc/scanHandlers";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1460,
    height: 950,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: "#06070b",
    title: "SVANSAI Debugger Agent",
    icon: path.join(__dirname, "../../assets/icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerScanHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
