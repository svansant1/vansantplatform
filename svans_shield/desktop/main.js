const { app, BrowserWindow, nativeImage } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

let mainWindow = null;
let backendProcess = null;
let frontendServer = null;

const FRONTEND_PORT = 4173;

const LOADING_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#050711;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
    .wrap{text-align:center}
    .spinner{width:40px;height:40px;border:3px solid rgba(168,85,247,.2);border-top-color:#a855f7;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 24px}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{font-size:1.5rem;font-weight:800;letter-spacing:-.02em}
    p{margin-top:8px;color:#71717a;font-size:.875rem}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="spinner"></div>
    <h1>SVANS Shield</h1>
    <p>Starting protection engine&hellip;</p>
  </div>
</body>
</html>`;

function errorHTML(msg) {
  const escaped = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#050711;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
    .wrap{text-align:center;max-width:420px;padding:24px}
    .icon{font-size:2.5rem;margin-bottom:16px}
    h1{font-size:1.25rem;font-weight:800}
    p{margin-top:10px;color:#71717a;font-size:.875rem;line-height:1.6}
    .hint{margin-top:16px;color:#a855f7;font-size:.75rem}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">&#9888;&#65039;</div>
    <h1>Engine Not Ready</h1>
    <p>${escaped}</p>
    <p class="hint">Check that Python and required packages are installed, then restart Shield.</p>
  </div>
</body>
</html>`;
}

function getBackendPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "services", "shield-engine")
    : path.join(__dirname, "../services/shield-engine");
}

function getFrontendRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "frontend", "out")
    : path.join(__dirname, "../frontend/out");
}

function startFrontendServer() {
  const root = getFrontendRoot();
  const realRoot = path.resolve(root);

  frontendServer = http.createServer((req, res) => {
    const rawUrl = req.url ? req.url.split("?")[0] : "/";
    let safePath = decodeURIComponent(rawUrl).replace(/^\/+/, "");

    if (safePath === "") {
      safePath = "shield/index.html";
    }

    if (safePath.startsWith("shield/_next/")) {
      safePath = safePath.replace("shield/_next/", "_next/");
    }

    if (safePath.startsWith("shield/") && !safePath.endsWith("index.html")) {
      const possiblePublicAsset = safePath.replace("shield/", "");
      const publicAssetPath = path.join(root, possiblePublicAsset);

      if (fs.existsSync(publicAssetPath)) {
        safePath = possiblePublicAsset;
      }
    }

    if (safePath.endsWith("/")) {
      safePath += "index.html";
    }

    let filePath = path.join(root, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      filePath = path.join(root, safePath, "index.html");
    }

    // Guard against path traversal: resolved path must stay inside root.
    const resolvedFilePath = path.resolve(filePath);
    if (
      resolvedFilePath !== realRoot &&
      !resolvedFilePath.startsWith(realRoot + path.sep)
    ) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    const contentTypes = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".json": "application/json",
      ".txt": "text/plain",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    };

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
    });

    fs.createReadStream(filePath).pipe(res);
  });

  frontendServer.listen(FRONTEND_PORT, "127.0.0.1");
}

function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "SVANS Shield",
    backgroundColor: "#050711",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!icon.isEmpty()) {
    mainWindow.setIcon(icon);
  }

  // Show loading screen immediately while the Python backend starts.
  mainWindow.loadURL(`data:text/html,${encodeURIComponent(LOADING_HTML)}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startBackend() {
  const backendPath = getBackendPath();

  backendProcess = spawn(
    "python",
    ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
      cwd: backendPath,
      shell: false,
      windowsHide: true,
    }
  );

  backendProcess.stdout.on("data", (data) => {
    console.log(`[Backend]: ${data.toString()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`[Backend ERROR]: ${data.toString()}`);
  });

  backendProcess.on("error", (error) => {
    console.error("[Backend Spawn Error]:", error);
  });

  backendProcess.on("exit", (code) => {
    console.log(`[Backend exited with code ${code}]`);
    backendProcess = null;
  });
}

function waitForBackend(maxWaitMs = 30000, pollIntervalMs = 500) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxWaitMs;

    function attempt() {
      const req = http.get("http://127.0.0.1:8000/health", (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });

      req.setTimeout(pollIntervalMs);
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });

      function retry() {
        if (Date.now() >= deadline) {
          reject(new Error("The protection engine did not start within 30 seconds."));
        } else {
          setTimeout(attempt, pollIntervalMs);
        }
      }
    }

    attempt();
  });
}

function stopEverything() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }

  if (frontendServer) {
    frontendServer.close();
    frontendServer = null;
  }
}

app.whenReady().then(async () => {
  startFrontendServer();
  startBackend();
  createWindow();

  try {
    await waitForBackend(30000, 500);
    if (mainWindow) {
      mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_PORT}/shield/`);
    }
  } catch (err) {
    console.error("[Startup]:", err.message);
    if (mainWindow) {
      mainWindow.loadURL(
        `data:text/html,${encodeURIComponent(errorHTML(err.message))}`
      );
    }
  }
});

app.on("before-quit", stopEverything);

app.on("window-all-closed", () => {
  stopEverything();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
