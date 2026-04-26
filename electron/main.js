const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");

let mainWindow = null;
let debugConsoleWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL("https://vansantplatform.com");
}

function createDebugConsoleWindow() {
  if (debugConsoleWindow && !debugConsoleWindow.isDestroyed()) {
    debugConsoleWindow.focus();
    return;
  }

  debugConsoleWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 450,
    resizable: true,
    title: "Vansant Debug Console",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  debugConsoleWindow.loadURL("http://localhost:3000/debug-console");

  debugConsoleWindow.on("closed", () => {
    debugConsoleWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  ipcMain.on("open-debugger", () => {
    createDebugConsoleWindow();
  });

  ipcMain.handle("pick-source-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Source File",
      properties: ["openFile"],
      filters: [
        {
          name: "Source Files",
          extensions: ["js", "ts", "tsx", "jsx", "py", "java", "cpp", "c", "cs", "html", "css", "json"],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});