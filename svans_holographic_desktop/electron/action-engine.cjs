"use strict";

const { shell } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const BLOCKED_PROCESSES = new Set([
  "csrss.exe", "dwm.exe", "explorer.exe", "lsass.exe", "services.exe", "smss.exe",
  "svchost.exe", "system", "wininit.exe", "winlogon.exe", "electron.exe",
]);
const SKIPPED_DIRECTORIES = new Set([
  "$recycle.bin", ".git", ".next", "appdata", "node_modules", "system volume information",
]);
const READABLE_TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".log", ".js", ".ts", ".cjs", ".mjs",
  ".py", ".html", ".css", ".yml", ".yaml", ".xml",
]);
const MAX_READ_BYTES = 400_000; // ~400KB cap so a huge log file can't blow up a chat request
const MAX_FETCH_BYTES = 1_500_000;
const APP_ALIASES = Object.freeze({
  calculator: { executable: "calc.exe" },
  calc: { executable: "calc.exe" },
  notepad: { executable: "notepad.exe" },
  paint: { executable: "mspaint.exe" },
  explorer: { executable: "explorer.exe" },
  "file explorer": { executable: "explorer.exe" },
  settings: { uri: "ms-settings:" },
  "task manager": { executable: "taskmgr.exe" },
  terminal: { executable: "wt.exe" },
  powershell: { executable: "powershell.exe" },
  "command prompt": { executable: "cmd.exe" },
  edge: { executable: "msedge.exe" },
  chrome: { executable: "chrome.exe" },
  firefox: { executable: "firefox.exe" },
  steam: { uri: "steam://open/main" },
  xbox: { uri: "xbox:" },
});

function existingDirectories(paths) {
  return [...new Set(paths.filter(Boolean).map((entry) => path.resolve(entry)).filter((entry) => fs.existsSync(entry)).map((entry) => {
    try { return fs.realpathSync(entry); } catch { return entry; }
  }))];
}

function createActionEngine({ workspaceRoot, onAudit = () => {}, shellAdapter = shell, searchApiKey = "", socialConnectors = null, businessOps = null } = {}) {
  const userHome = os.homedir();
  const folderAliases = Object.freeze({
    desktop: path.join(userHome, "Desktop"),
    documents: path.join(userHome, "Documents"),
    downloads: path.join(userHome, "Downloads"),
    pictures: path.join(userHome, "Pictures"),
    music: path.join(userHome, "Music"),
    videos: path.join(userHome, "Videos"),
    onedrive: process.env.OneDrive || "",
    workspace: workspaceRoot || "",
  });
  const allowedRoots = existingDirectories(Object.values(folderAliases));
  const permissions = {
    files: true,
    apps: true,
    browser: true,
    processes: true,
    admin: true,     // execution still requires per-action owner confirmation and Windows UAC
    research: true,  // read-only outbound web fetch / search
    social: true,    // connected platform APIs still require valid owner-provided credentials
    screen: true,    // permission flag for active-application context and walkthrough overlays
    business: true,  // local CRM-shaped data only — no external calls, same trust tier as files
  };
  const activeHelpers = new Set();
  let registeredAppsCache = [];
  let registeredAppsLoadedAt = 0;

  function audit(action, detail, status = "completed") {
    const entry = { action, detail, status, timestamp: new Date().toISOString() };
    onAudit(entry);
    return entry;
  }

  function permissionSnapshot() {
    return { ...permissions };
  }

  function setPermission(capability, enabled) {
    if (!Object.hasOwn(permissions, capability)) throw new Error("Unknown capability.");
    permissions[capability] = Boolean(enabled);
    audit("permission", `${capability} ${permissions[capability] ? "enabled" : "disabled"}`);
    return permissionSnapshot();
  }

  function requirePermission(capability) {
    if (!permissions[capability]) {
      const error = new Error(`${capability.toUpperCase()}_PERMISSION_REQUIRED`);
      error.code = "PERMISSION_REQUIRED";
      throw error;
    }
  }

  function isAllowedPath(targetPath) {
    const resolved = path.resolve(targetPath).toLowerCase();
    return allowedRoots.some((root) => {
      const normalizedRoot = root.toLowerCase();
      return resolved === normalizedRoot || resolved.startsWith(`${normalizedRoot}${path.sep}`);
    });
  }

  function resolveFolder(alias) {
    const target = folderAliases[String(alias || "").trim().toLowerCase()];
    if (!target || !fs.existsSync(target) || !isAllowedPath(target)) throw new Error("Approved folder not found.");
    return path.resolve(target);
  }

  function safeUserPath(targetPath) {
    const resolved = path.resolve(String(targetPath || ""));
    if (!isAllowedPath(resolved)) throw new Error("Path is outside approved owner folders.");
    let realPath;
    try { realPath = fs.realpathSync(resolved); } catch { throw new Error("File or folder does not exist."); }
    if (!isAllowedPath(realPath)) throw new Error("Linked path leaves approved owner folders.");
    return realPath;
  }

  function launchDetached(executable, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }

  async function runHelper(executable, args, options = {}) {
    const controller = new AbortController();
    activeHelpers.add(controller);
    try {
      return await execFileAsync(executable, args, { ...options, signal: controller.signal });
    } finally {
      activeHelpers.delete(controller);
    }
  }

  async function collectShortcuts(root, depth = 0, results = []) {
    if (!root || depth > 5 || results.length > 600) return results;
    let entries;
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      if (results.length > 600) break;
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) await collectShortcuts(fullPath, depth + 1, results);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".lnk")) {
        results.push({ name: path.basename(entry.name, ".lnk"), path: fullPath });
      }
    }
    return results;
  }

  async function installedShortcuts() {
    const roots = existingDirectories([
      path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
      path.join(process.env.ProgramData || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    ]);
    const all = (await Promise.all(roots.map((root) => collectShortcuts(root)))).flat();
    const unique = new Map();
    for (const shortcut of all) unique.set(shortcut.name.toLowerCase(), shortcut);
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function registeredWindowsApps() {
    if (registeredAppsCache.length && Date.now() - registeredAppsLoadedAt < 5 * 60 * 1000) return registeredAppsCache;
    try {
      const command = "Get-StartApps | Where-Object { $_.Name -and $_.AppID -and $_.AppID -notmatch '^https?://' } | Select-Object Name,AppID | ConvertTo-Json -Compress";
      const { stdout } = await runHelper("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
      const parsed = JSON.parse(String(stdout || "[]").trim() || "[]");
      registeredAppsCache = (Array.isArray(parsed) ? parsed : [parsed])
        .filter((entry) => typeof entry?.Name === "string" && typeof entry?.AppID === "string")
        .map((entry) => ({ name: entry.Name.trim(), appId: entry.AppID.trim(), kind: "registered" }))
        .filter((entry) => entry.name && entry.appId);
      registeredAppsLoadedAt = Date.now();
      return registeredAppsCache;
    } catch {
      return registeredAppsCache;
    }
  }

  function normalizedAppName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[®™©]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function scoreAppCandidate(candidateName, requestedName) {
    const candidate = normalizedAppName(candidateName);
    const requested = normalizedAppName(requestedName);
    if (!candidate || !requested) return -1;
    if (candidate === `${requested} player`) return 120;
    if (candidate === requested) return 110;
    if (candidate.startsWith(`${requested} `)) return 82 - Math.min(20, candidate.length - requested.length);
    if (candidate.endsWith(` ${requested}`)) return 78 - Math.min(20, candidate.length - requested.length);
    if (candidate.split(" ").includes(requested)) return 68 - Math.min(20, candidate.length - requested.length);
    if (candidate.includes(requested)) return 48 - Math.min(25, candidate.length - requested.length);
    if (requested.includes(candidate) && candidate.length >= 4) return 38 - Math.min(20, requested.length - candidate.length);
    return -1;
  }

  async function applicationCatalog() {
    const [shortcuts, registered] = await Promise.all([installedShortcuts(), registeredWindowsApps()]);
    const combined = [
      ...shortcuts.map((entry) => ({ ...entry, kind: "shortcut" })),
      ...registered,
    ];
    const unique = new Map();
    for (const app of combined) {
      const key = normalizedAppName(app.name);
      const existing = unique.get(key);
      if (!existing || (app.kind === "shortcut" && existing.kind !== "shortcut")) unique.set(key, app);
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function launchApp(rawName) {
    requirePermission("apps");
    const name = String(rawName || "").trim().toLowerCase().replace(/[.?!]+$/, "");
    if (!name || name.length > 120) throw new Error("Application name is required.");
    const alias = APP_ALIASES[name];
    if (alias?.uri) {
      await shellAdapter.openExternal(alias.uri);
      audit("launch_app", name);
      return { message: `Opening ${name}.`, title: "APPLICATION LAUNCHED", lines: [name] };
    }
    if (alias?.executable) {
      await launchDetached(alias.executable);
      audit("launch_app", name);
      return { message: `Opening ${name}.`, title: "APPLICATION LAUNCHED", lines: [name] };
    }

    const catalog = await applicationCatalog();
    const ranked = catalog
      .map((app) => ({ app, score: scoreAppCandidate(app.name, name) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.app.name.length - b.app.name.length);
    const best = ranked[0];
    const runnerUp = ranked[1];
    const match = best && (best.score >= 100 || !runnerUp || best.score - runnerUp.score >= 8) ? best.app : null;
    if (!match) {
      const suggestions = ranked.slice(0, 8).map((entry) => entry.app.name);
      return {
        message: suggestions.length ? `I found several possible matches for ${rawName}.` : `I could not find ${rawName} in the Windows application catalog.`,
        title: "APPLICATION SEARCH",
        lines: suggestions.length ? suggestions : ["No registered application matched."],
      };
    }
    if (match.kind === "shortcut") {
      const error = await shellAdapter.openPath(match.path);
      if (error) throw new Error(error);
    } else {
      await launchDetached("explorer.exe", [`shell:AppsFolder\\${match.appId}`]);
    }
    audit("launch_app", match.name);
    return { message: `Opening ${match.name}.`, title: "APPLICATION LAUNCHED", lines: [match.name] };
  }

  async function listApps(query = "") {
    requirePermission("apps");
    const filter = String(query || "").trim().toLowerCase();
    const catalog = await applicationCatalog();
    const names = catalog.map((entry) => entry.name).filter((name) => !filter || normalizedAppName(name).includes(normalizedAppName(filter))).slice(0, 80);
    audit("list_apps", filter || "all");
    return { message: `I found ${names.length} matching installed applications.`, title: "INSTALLED APPLICATIONS", lines: names.length ? names : ["No matches found."] };
  }

  async function listDirectory(alias) {
    requirePermission("files");
    const target = resolveFolder(alias);
    const entries = (await fsp.readdir(target, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, 40)
      .map((entry) => `${entry.isDirectory() ? "FOLDER" : "FILE"} · ${entry.name}`);
    audit("list_directory", target);
    return { message: `Here is what is in your ${alias} folder.`, title: `${String(alias).toUpperCase()} FILES`, lines: entries.length ? entries : ["This folder is empty."] };
  }

  async function openFolder(alias) {
    requirePermission("files");
    const target = resolveFolder(alias);
    const error = await shellAdapter.openPath(target);
    if (error) throw new Error(error);
    audit("open_folder", target);
    return { message: `Opening your ${alias} folder.`, title: "FOLDER OPENED", lines: [target] };
  }

  async function searchDirectory(root, query, depth, results) {
    if (depth > 5 || results.length >= 50) return;
    let entries;
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= 50) return;
      if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
      const fullPath = path.join(root, entry.name);
      if (entry.name.toLowerCase().includes(query)) results.push({ name: entry.name, path: fullPath, directory: entry.isDirectory() });
      if (entry.isDirectory()) await searchDirectory(fullPath, query, depth + 1, results);
    }
  }

  async function searchFiles(rawQuery) {
    requirePermission("files");
    const query = String(rawQuery || "").trim().toLowerCase().replace(/^['"]|['"]$/g, "");
    if (query.length < 2 || query.length > 100) throw new Error("Use a file search between 2 and 100 characters.");
    const results = [];
    for (const root of allowedRoots) {
      await searchDirectory(root, query, 0, results);
      if (results.length >= 50) break;
    }
    audit("search_files", query);
    return {
      message: results.length ? `I found ${results.length} matching files or folders.` : `I could not find anything matching ${rawQuery}.`,
      title: "FILE SEARCH RESULTS",
      lines: results.slice(0, 24).map((entry) => `${entry.directory ? "FOLDER" : "FILE"} · ${entry.path}`),
      results: results.slice(0, 50),
    };
  }

  async function openPath(targetPath) {
    requirePermission("files");
    const target = safeUserPath(targetPath);
    const error = await shellAdapter.openPath(target);
    if (error) throw new Error(error);
    audit("open_path", target);
    return { message: `Opening ${path.basename(target)}.`, title: "FILE OPENED", lines: [target] };
  }

  async function openUrl(rawUrl) {
    requirePermission("browser");
    let value = String(rawUrl || "").trim();
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS destinations are allowed.");
    if (url.username || url.password) throw new Error("URLs containing embedded credentials are blocked.");
    await shellAdapter.openExternal(url.toString());
    audit("open_url", url.hostname);
    return { message: `Opening ${url.hostname} in your browser.`, title: "BROWSER DESTINATION", lines: [url.toString()] };
  }

  async function browserContext() {
    requirePermission("browser");
    const script = String.raw`
$windows = @(Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if (-not $windows.Count) {
  @{ edgeRunning = [bool](Get-Process msedge -ErrorAction SilentlyContinue); windows = @(); tabs = @(); activeUrl = $null } | ConvertTo-Json -Compress
  exit 0
}
Add-Type -AssemblyName UIAutomationClient
$windowTitles = [System.Collections.Generic.List[string]]::new()
$tabTitles = [System.Collections.Generic.List[string]]::new()
$activeUrl = $null
foreach ($edge in $windows) {
  if ($edge.MainWindowTitle) { $windowTitles.Add($edge.MainWindowTitle) }
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($edge.MainWindowHandle)
    $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($item in $elements) {
      if ($item.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem -and $item.Current.Name) {
        $name = $item.Current.Name -replace '\s+-\s+Memory usage\s+-\s+.+$', ''
        if ($name -and -not $tabTitles.Contains($name)) { $tabTitles.Add($name) }
      }
    }
    $editCondition = [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit
    )
    foreach ($edit in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCondition)) {
      try {
        $value = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
        if ($value -match '^https?://') { $activeUrl = $value; break }
      } catch {}
    }
  } catch {}
}
@{ edgeRunning = $true; windows = @($windowTitles); tabs = @($tabTitles); activeUrl = $activeUrl } | ConvertTo-Json -Compress
`;
    const { stdout } = await runHelper("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
    let context;
    try {
      context = JSON.parse(String(stdout || "").trim());
    } catch {
      throw new Error("Windows returned browser state in an unreadable format.");
    }
    const tabs = Array.isArray(context.tabs) ? context.tabs.filter(Boolean).slice(0, 50) : [];
    const activeUrl = typeof context.activeUrl === "string" && /^https?:\/\//i.test(context.activeUrl) ? context.activeUrl : "";
    let activeHost = "";
    try { activeHost = activeUrl ? new URL(activeUrl).hostname : ""; } catch {}
    const lines = tabs.map((title, index) => `${index + 1}. ${title}`);
    if (activeUrl) lines.unshift(`ACTIVE · ${activeHost} · ${activeUrl}`);
    if (!context.edgeRunning) lines.push("Microsoft Edge is not running.");
    else if (!tabs.length) lines.push("Edge is running, but Windows did not expose its tab titles.");
    const message = !context.edgeRunning
      ? "Edge is not open right now."
      : tabs.length
        ? `I checked Edge directly. You have ${tabs.length} tab${tabs.length === 1 ? "" : "s"} open${activeHost ? `, and the active page is on ${activeHost}` : ""}.`
        : "Edge is running, but I could not read its tabs from the Windows interface.";
    audit("browser_context", `${tabs.length} Edge tabs visible`);
    return { message, title: "LIVE EDGE CONTEXT", lines, context: { browser: "Microsoft Edge", tabs, activeUrl, windows: context.windows || [] } };
  }

  async function readFileText(targetPath) {
    requirePermission("files");
    const target = safeUserPath(targetPath);
    const stats = await fsp.stat(target);
    if (!stats.isFile()) throw new Error("That path is not a file.");
    const ext = path.extname(target).toLowerCase();
    if (!READABLE_TEXT_EXTENSIONS.has(ext)) {
      throw new Error(`SVANS can read plain-text files directly (.txt, .md, .csv, code files). "${ext}" needs a dedicated extractor — PDFs and Word docs aren't wired up yet.`);
    }
    if (stats.size > MAX_READ_BYTES) throw new Error(`That file is too large to read in full (${Math.round(stats.size / 1024)}KB). Open it directly instead.`);
    const content = await fsp.readFile(target, "utf8");
    audit("read_file", target);
    return {
      message: `Read ${path.basename(target)}.`,
      title: "FILE CONTENTS",
      lines: [`${content.length} characters loaded from ${path.basename(target)}.`],
      content, // raw text handed to the caller so it can be summarized by the chat model
      path: target,
    };
  }

  function stripHtmlToText(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|br|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Read-only: fetches a page and hands back extracted text. Never submits forms,
  // never authenticates, never clicks anything — that's a different risk tier.
  async function fetchPage(rawUrl) {
    requirePermission("research");
    let value = String(rawUrl || "").trim();
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS destinations are allowed.");
    const response = await fetch(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "SVANS-Research/1.0" },
    });
    if (!response.ok) throw new Error(`Fetch failed (${response.status}) for ${url.hostname}.`);
    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_FETCH_BYTES) throw new Error("That page is too large to read in full.");
    const raw = buffer.toString("utf8");
    const text = contentType.includes("html") ? stripHtmlToText(raw) : raw;
    const trimmed = text.slice(0, 20_000);
    audit("fetch_page", url.hostname);
    return {
      message: `Read the page at ${url.hostname}.`,
      title: "PAGE CONTENTS",
      lines: [`${trimmed.length} characters extracted from ${url.hostname}.`],
      content: trimmed,
      sourceUrl: url.toString(),
    };
  }

  // Requires a search provider API key (e.g. Brave Search API) set via
  // SVANS_SEARCH_API_KEY. No key configured = capability reports unavailable
  // rather than silently failing or falling back to scraping a search engine's HTML.
  async function webSearch(rawQuery, apiKey) {
    requirePermission("research");
    const query = String(rawQuery || "").trim();
    if (!query || query.length > 300) throw new Error("Give me a search query between 1 and 300 characters.");
    if (!apiKey) throw new Error("Web search is not connected. Add a search provider API key in Settings to enable it.");
    const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("count", "6");
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Search provider returned an error (${response.status}).`);
    const data = await response.json().catch(() => ({}));
    const results = (data?.web?.results || []).slice(0, 6).map((entry) => ({
      title: entry.title,
      url: entry.url,
      snippet: entry.description ? stripHtmlToText(entry.description) : "",
    }));
    audit("web_search", query);
    return {
      message: results.length ? `I found ${results.length} results for "${query}".` : `No results found for "${query}".`,
      title: "WEB SEARCH RESULTS",
      lines: results.map((entry) => `${entry.title} · ${entry.url}`),
      results,
    };
  }

  function parseCsvLine(line) {
    const values = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === ',' && !quoted) { values.push(value); value = ""; }
      else value += character;
    }
    values.push(value);
    return values;
  }

  async function runningProcesses() {
    requirePermission("processes");
    const { stdout } = await runHelper("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    const processes = stdout.split(/\r?\n/).filter(Boolean).map(parseCsvLine).map((fields) => ({
      name: fields[0], pid: Number(fields[1]), memory: fields[4],
    })).filter((entry) => entry.name && Number.isFinite(entry.pid));
    const grouped = [...new Map(processes.map((entry) => [entry.name.toLowerCase(), entry])).values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    audit("list_processes", `${grouped.length} unique`);
    return { message: `${grouped.length} different processes are currently running.`, title: "RUNNING APPLICATIONS", lines: grouped.slice(0, 35).map((entry) => `${entry.name} · PID ${entry.pid} · ${entry.memory}`), processes: grouped };
  }

  async function closeApp(rawName) {
    requirePermission("processes");
    const query = String(rawName || "").trim().toLowerCase().replace(/\.exe$/, "");
    if (!/^[a-z0-9_. -]{2,80}$/i.test(query)) throw new Error("Invalid process name.");
    const listed = await runningProcesses();
    const matches = listed.processes.filter((entry) => entry.name.toLowerCase().replace(/\.exe$/, "").includes(query));
    if (matches.length !== 1) {
      return { message: matches.length ? `I found multiple processes matching ${rawName}.` : `I could not find a running app matching ${rawName}.`, title: "PROCESS MATCH", lines: matches.slice(0, 12).map((entry) => `${entry.name} · PID ${entry.pid}`) };
    }
    const match = matches[0];
    if (BLOCKED_PROCESSES.has(match.name.toLowerCase())) throw new Error("SVANS Guardian blocked termination of a protected process.");
    await runHelper("taskkill.exe", ["/PID", String(match.pid), "/T"], { windowsHide: true });
    audit("close_app", `${match.name} PID ${match.pid}`);
    return { message: `${match.name} has been closed.`, title: "APPLICATION CLOSED", lines: [`${match.name} · PID ${match.pid}`] };
  }

  async function lockComputer() {
    requirePermission("apps");
    audit("lock_computer", os.hostname(), "started");
    await launchDetached("rundll32.exe", ["user32.dll,LockWorkStation"]);
    return { message: "Locking the computer now.", title: "OWNER SESSION LOCKED", lines: [os.hostname()] };
  }

  async function runElevatedOperation(operation) {
    requirePermission("admin");
    const scripts = {
      flush_dns: "Start-Process -FilePath 'ipconfig.exe' -ArgumentList '/flushdns' -Verb RunAs -Wait -WindowStyle Hidden",
    };
    const script = scripts[operation];
    if (!script) throw new Error("Administrator operation is not allowlisted.");
    audit("admin_operation", operation, "approval_requested");
    await runHelper("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 120000 });
    audit("admin_operation", operation);
    return { message: operation === "flush_dns" ? "The Windows DNS cache has been flushed." : "Administrator operation completed.", title: "ADMINISTRATOR ACTION COMPLETE", lines: [operation] };
  }

  function cancelAll() {
    for (const controller of activeHelpers) {
      try { controller.abort(); } catch {}
    }
    activeHelpers.clear();
    audit("emergency_stop", "All SVANS helper operations cancelled");
    return { message: "Emergency stop activated. All SVANS helper operations were cancelled.", title: "EMERGENCY STOP", lines: ["Local helper queue cleared", "No new operation will run without a new owner command"] };
  }

  async function execute(action) {
    const type = String(action?.type || "");
    const payload = action?.payload || {};
    if (type === "launch_app") return launchApp(payload.name);
    if (type === "list_apps") return listApps(payload.query);
    if (type === "list_directory") return listDirectory(payload.folder);
    if (type === "open_folder") return openFolder(payload.folder);
    if (type === "search_files") return searchFiles(payload.query);
    if (type === "open_path") return openPath(payload.path);
    if (type === "open_url") return openUrl(payload.url);
    if (type === "browser_context") return browserContext();
    if (type === "read_file") return readFileText(payload.path);
    if (type === "fetch_page") return fetchPage(payload.url);
    if (type === "web_search") return webSearch(payload.query, searchApiKey);
    if (type === "list_processes") return runningProcesses();
    if (type === "close_app") return closeApp(payload.name);
    if (type === "lock_computer") return lockComputer();
    if (type === "flush_dns") return runElevatedOperation("flush_dns");
    if (type === "emergency_stop") return cancelAll();
    if (type.startsWith("social:")) {
      requirePermission("social");
      if (!socialConnectors) throw new Error("No social connectors are configured.");
      const result = await socialConnectors.execute(type.slice("social:".length), payload);
      audit(type, payload?.platform || "social");
      return result;
    }
    if (type.startsWith("business:")) {
      requirePermission("business");
      if (!businessOps) throw new Error("Business-ops is not configured.");
      const result = await businessOps.execute(type.slice("business:".length), payload);
      audit(type, payload?.name || payload?.clientName || "business");
      return result;
    }
    throw new Error("Action is not in the SVANS capability registry.");
  }

  return {
    allowedRoots: () => allowedRoots.map((root) => ({ path: root, name: path.basename(root) || root })),
    cancelAll,
    execute,
    permissionSnapshot,
    setPermission,
  };
}

module.exports = { createActionEngine };
