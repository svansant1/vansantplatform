import { useMemo, useState } from "react";
import "../styles/global.css";
import type { ScanMode } from "../../shared/types/scan";
import svDebuggerMascot from "../public/svdebugger.png";
import { ModeCard } from "../components/ModeCard";
import { FindingsPanel } from "../components/FindingsPanel";
import { GuidedFixChat } from "../components/GuidedFixChat";
import { useConnection } from "../hooks/useConnection";
import { useGuidedChat } from "../hooks/useGuidedChat";
import { useScan } from "../hooks/useScan";
import type { ScanHistoryEntry } from "../hooks/useScan";

function HistoryBadge({
  entry,
  onLoad,
}: {
  entry: ScanHistoryEntry;
  onLoad: () => void;
}) {
  const statusColor =
    entry.problemCount > 0
      ? "#fca5a5"
      : entry.warningCount > 0
        ? "#fde68a"
        : "#86efac";

  return (
    <button
      type="button"
      className="history-entry"
      onClick={onLoad}
      title={entry.summary}
    >
      <span className="history-entry__scope">{entry.scope.toUpperCase()}</span>
      <span className="history-entry__time">
        {new Date(entry.scannedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <span className="history-entry__counts" style={{ color: statusColor }}>
        {entry.problemCount}P / {entry.warningCount}W
      </span>
    </button>
  );
}

export default function App() {
  const [statusText, setStatusText] = useState("Waiting for session code.");
  const [caseNotes, setCaseNotes] = useState(
    "Connect with a valid session code before running diagnostics.",
  );
  const [selectedMode, setSelectedMode] = useState<ScanMode>("apps");
  const [showHistory, setShowHistory] = useState(false);

  // Scan context shared with guided chat
  const [activeSummary, setActiveSummary] = useState("No scan has been run yet.");
  const [logs, setLogs] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  // Draggable mascot
  const [position, setPosition] = useState({ x: 70, y: 92 });
  const [dragging, setDragging] = useState(false);

  const connection = useConnection(setStatusText, setCaseNotes);

  // guidedChat declared before useScan so reset can be passed as onScanComplete
  const guidedChat = useGuidedChat({
    connected: connection.connected,
    selectedMode,
    activeSummary,
    logs,
    recommendations,
    setStatusText,
    setCaseNotes,
  });

  const scan = useScan({
    connected: connection.connected,
    selectedMode,
    setStatusText,
    setCaseNotes,
    setActiveSummary,
    setLogs,
    setRecommendations,
    onScanComplete: (firstIssue) => guidedChat.reset(firstIssue),
  });

  const handleDisconnect = () => {
    connection.disconnect();
    guidedChat.reset();
    setCaseNotes(
      "Disconnected. Reconnect with a valid session code before running diagnostics.",
    );
  };

  const modeSummary = useMemo(() => {
    switch (selectedMode) {
      case "network":
        return "Scan real network state, adapters, gateway health, and DNS connectivity.";
      case "sites":
        return "Inspect real open websites using the browser extension bridge.";
      case "files":
        return "Scan selected files, logs, configs, and folders.";
      case "apps":
      default:
        return "Scan running applications aggregated by process name and total memory.";
    }
  }, [selectedMode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - 80, y: e.clientY - 80 });
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void guidedChat.handleSendMessage();
    }
  };

  const handleConnectKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void connection.handleConnect();
  };

  const scanButtonsDisabled =
    !connection.connected || connection.isConnecting || scan.isScanning;

  return (
    <div
      className="app-shell"
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
    >
      <div className="app-frame">
        <header className="hero">
          <div className="hero__left hero__left--with-mascot">
            <div>
              <div className="hero__eyebrow">SV Inspector</div>
              <h1 className="hero__title-row">
                <span>SVANSAI Debugger Agent</span>
              </h1>
              <p className="hero__subtitle">{modeSummary}</p>
            </div>
          </div>

          <div
            className="floating-mascot"
            style={{ left: position.x, top: position.y }}
            onMouseDown={() => setDragging(true)}
          >
            <img
              src={svDebuggerMascot}
              alt="SV Inspector mascot"
              className="floating-mascot__img"
              draggable={false}
            />
          </div>

          <div className="connection-card">
            <div className="connection-card__row">
              <span className="muted">Connection Status</span>
              <span
                className={
                  connection.connected ? "status status--ok" : "status"
                }
              >
                {connection.connected ? "Connected" : "Waiting"}
              </span>
            </div>

            <input
              type="text"
              value={connection.sessionCode}
              onChange={(e) =>
                connection.setSessionCode(e.target.value.toUpperCase())
              }
              onKeyDown={handleConnectKeyDown}
              placeholder="Enter session code"
              className="input"
            />

            <div className="button-row">
              <button
                type="button"
                className="button button--primary"
                onClick={() => void connection.handleConnect()}
                disabled={connection.isConnecting}
              >
                {connection.isConnecting ? "Connecting..." : "Connect"}
              </button>

              <button
                type="button"
                className="button button--secondary"
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            </div>

            <div className="status-text">{statusText}</div>
          </div>
        </header>

        <main className="main-grid">
          {/* Left panel: mode selection + guided fix chat */}
          <section className="panel">
            <div className="panel__eyebrow">Investigation Modes</div>
            <h2 className="panel__title">Choose Scan Type</h2>

            <div className="mode-grid">
              <ModeCard
                title="Network"
                description="Analyze adapter state, gateway reachability, and DNS health."
                active={selectedMode === "network"}
                onClick={() => setSelectedMode("network")}
              />
              <ModeCard
                title="Sites"
                description="Analyze open browser tabs through the SVANSAI browser bridge."
                active={selectedMode === "sites"}
                onClick={() => setSelectedMode("sites")}
              />
              <ModeCard
                title="Apps"
                description="Analyze running apps aggregated by name and total memory usage."
                active={selectedMode === "apps"}
                onClick={() => setSelectedMode("apps")}
              />
              <ModeCard
                title="Files"
                description="Analyze selected files, logs, configs, and folders."
                active={selectedMode === "files"}
                onClick={() => setSelectedMode("files")}
              />
            </div>

            {selectedMode === "files" && (
              <div className="folder-picker">
                <div className="folder-picker__label">Scan target</div>
                <div className="folder-picker__row">
                  <span className="folder-picker__path">
                    {scan.filesTarget ||
                      "No folder selected — defaults to working directory"}
                  </span>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => void scan.handlePickFolder()}
                  >
                    Browse&hellip;
                  </button>
                </div>
              </div>
            )}

            <GuidedFixChat
              selectedFinding={guidedChat.selectedFinding}
              messages={guidedChat.guidedMessages}
              input={guidedChat.guidedInput}
              onInputChange={guidedChat.setGuidedInput}
              onSend={() => void guidedChat.handleSendMessage()}
              onMarkTried={() => void guidedChat.handleMarkTried()}
              onKeyDown={handleChatKeyDown}
              isLoading={guidedChat.isGuidedLoading}
              disabled={!connection.connected}
              attemptedFixes={guidedChat.attemptedFixes}
            />
          </section>

          {/* Right panel: case file, scan controls, findings */}
          <section className="panel">
            <div className="panel__eyebrow panel__eyebrow--orange">
              Active Case File
            </div>
            <h2 className="panel__title">
              {selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)}{" "}
              Investigation
            </h2>

            <div className="case-box">
              <div className="case-box__label">Current Scope</div>
              <p className="case-box__text">{activeSummary}</p>

              <div
                className="case-box__text"
                style={{ display: "flex", gap: 20, flexWrap: "wrap" }}
              >
                <span>
                  <strong>Good</strong> {scan.goodCount}
                </span>
                <span>
                  <strong>Warning</strong> {scan.warningCount}
                </span>
                <span>
                  <strong>Problem</strong> {scan.problemCount}
                </span>
              </div>

              {scan.isScanning && (
                <div className="scan-state" role="status" aria-live="polite">
                  <span className="scan-state__dot" />
                  <span>
                    Running {scan.activeScanLabel} scan
                    {scan.scanElapsedSeconds > 0
                      ? ` (${scan.scanElapsedSeconds}s)`
                      : ""}
                  </span>
                </div>
              )}

              <div className="action-grid">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void scan.handleStartScan()}
                  disabled={scanButtonsDisabled}
                >
                  {scan.isScanning ? "Scanning..." : "Start Scan"}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    setCaseNotes(logs.join("\n") || "No logs yet.")
                  }
                  disabled={scanButtonsDisabled}
                >
                  Open Logs
                </button>
                <button
                  type="button"
                  className="button button--accent"
                  onClick={() =>
                    setCaseNotes(
                      recommendations.join("\n") || "No recommendations yet.",
                    )
                  }
                  disabled={scanButtonsDisabled}
                >
                  Recommended Actions
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void scan.exportResults()}
                  disabled={
                    scan.isScanning ||
                    scan.goodCount + scan.warningCount + scan.problemCount === 0
                  }
                >
                  Export Report
                </button>
              </div>
            </div>

            <div className="notes-box">
              <div className="notes-box__title">Case Notes</div>
              <p className="notes-box__text" style={{ whiteSpace: "pre-wrap" }}>
                {caseNotes}
              </p>
            </div>

            {/* Scan History */}
            {scan.scanHistory.length > 0 && (
              <div className="notes-box">
                <div
                  className="notes-box__title"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Scan History</span>
                  <button
                    type="button"
                    className="button button--secondary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => setShowHistory((v) => !v)}
                  >
                    {showHistory ? "Hide" : `Show (${scan.scanHistory.length})`}
                  </button>
                </div>

                {showHistory && (
                  <div className="history-list">
                    {scan.scanHistory.map((entry) => (
                      <HistoryBadge
                        key={entry.id}
                        entry={entry}
                        onLoad={() => scan.loadHistoryEntry(entry)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="notes-box">
              <div className="notes-box__title">Findings</div>
              <FindingsPanel
                findings={scan.findings}
                connected={connection.connected}
                onOpenGuidedFixChat={(finding) =>
                  void guidedChat.openGuidedFixChat(finding)
                }
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
