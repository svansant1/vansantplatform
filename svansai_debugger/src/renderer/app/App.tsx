import { useMemo, useState } from "react";
import "../styles/global.css";
import {
  PLATFORM_API_BASE_URL,
  SVANSAI_API_BASE_URL,
} from "../../shared/constants/api";
import svDebuggerMascot from "../public/svdebugger.png";
console.log("Mascot path:", svDebuggerMascot);

type ScanMode = "game" | "network" | "sites" | "apps" | "files";

type ClaimResponse = {
  ok: boolean;
  message?: string;
  error?: string;
};

type ChatApiResponse = {
  answer?: string;
  response?: string;
  source?: string;
};

function ModeCard({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mode-card ${active ? "mode-card--active" : ""}`}
      onClick={onClick}
    >
      <div className="mode-card__title">{title}</div>
      <div className="mode-card__description">{description}</div>
    </button>
  );
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export default function App() {
  const [sessionCode, setSessionCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ScanMode>("apps");
  const [statusText, setStatusText] = useState("Waiting for session code.");
  const [isConnecting, setIsConnecting] = useState(false);

  const [caseNotes, setCaseNotes] = useState(
    "Connect with a valid session code before running diagnostics.",
  );
  const [activeSummary, setActiveSummary] = useState(
    "No scan has been run yet.",
  );
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  const [selectedFinding, setSelectedFinding] = useState<ScanFinding | null>(
    null,
  );
  const [attemptedFixes, setAttemptedFixes] = useState<string[]>([]);
  const [guidedInput, setGuidedInput] = useState("");
  const [guidedMessages, setGuidedMessages] = useState<ChatMessage[]>([]);
  const [isGuidedLoading, setIsGuidedLoading] = useState(false);

  const [position, setPosition] = useState({ x: 70, y: 92 });
  const [dragging, setDragging] = useState(false);

  const modeSummary = useMemo(() => {
    switch (selectedMode) {
      case "network":
        return "Scan real network state, adapters, connectivity, and DNS health.";
      case "sites":
        return "Inspect real open websites using the browser extension bridge.";
      case "files":
        return "Scan selected files, logs, configs, and folders.";
      case "apps":
        return "Scan real running applications and classify potential issues.";
      case "game":
      default:
        return "Game diagnostics are not wired yet.";
    }
  }, [selectedMode]);

  const goodCount = useMemo(
    () => findings.filter((f) => f.status === "good").length,
    [findings],
  );
  const warningCount = useMemo(
    () => findings.filter((f) => f.status === "warning").length,
    [findings],
  );
  const problemCount = useMemo(
    () => findings.filter((f) => f.status === "problem").length,
    [findings],
  );

  const handleMouseDown = () => setDragging(true);
  const handleMouseUp = () => setDragging(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;

    setPosition({
      x: e.clientX - 80,
      y: e.clientY - 80,
    });
  };

  const resetGuidedFixState = () => {
    setSelectedFinding(null);
    setAttemptedFixes([]);
    setGuidedInput("");
    setGuidedMessages([]);
  };

  const handleConnect = async () => {
    const trimmedCode = sessionCode.trim().toUpperCase();

    if (!trimmedCode) {
      setConnected(false);
      setStatusText("Enter a session code first.");
      return;
    }

    setIsConnecting(true);
    setStatusText("Connecting to Platform backend...");

    try {
      const response = await fetch(
        `${PLATFORM_API_BASE_URL}/debugger/connect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: trimmedCode,
            device_name: "This-PC",
          }),
        },
      );

      const data = (await response.json()) as ClaimResponse;

      if (data.ok) {
        setConnected(true);
        setStatusText(data.message || "Connected successfully.");
        setCaseNotes(
          "Debugger session connected through the Platform backend. Scans and Guided Fix Chat are now unlocked.",
        );
      } else {
        setConnected(false);
        setStatusText(data.error || "Connection failed.");
        setCaseNotes(
          "Connection failed. Enter a valid session code before scanning.",
        );
      }
    } catch (error) {
      setConnected(false);
      setStatusText(
        error instanceof Error
          ? `Connection failed: ${error.message}`
          : "Connection failed.",
      );
      setCaseNotes(
        "Connection failed. Verify the Platform backend is running and try again.",
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setConnected(false);
    setSessionCode("");
    setStatusText("Disconnected.");
    setCaseNotes(
      "Disconnected. Reconnect with a valid session code before running diagnostics.",
    );
    resetGuidedFixState();
  };

  const handleStartScan = async () => {
    if (!connected) {
      setStatusText("Connect with a valid session code before scanning.");
      setCaseNotes(
        "Connect with a valid session code before running diagnostics.",
      );
      return;
    }

    setStatusText(`Running ${selectedMode} scan...`);

    try {
      let result: ScanResult;

      switch (selectedMode) {
        case "apps":
          result = await window.scanner.apps();
          break;
        case "network":
          result = await window.scanner.network();
          break;
        case "files":
          result = await window.scanner.files("C:\\");
          break;
        case "sites":
          result = await window.scanner.sites();
          break;
        default:
          result = {
            scope: "apps",
            summary: "Selected mode is not wired.",
            findings: [],
            logs: [],
            recommendations: [],
            scannedAt: new Date().toISOString(),
          };
      }

      setActiveSummary(result.summary);
      setFindings(result.findings);
      setLogs(result.logs);
      setRecommendations(result.recommendations);
      setCaseNotes(
        `Scan completed at ${new Date(result.scannedAt).toLocaleString()}. Review findings, logs, and recommendations below.`,
      );
      setStatusText("Scan complete.");

      const firstIssue =
        result.findings.find((f) => f.status !== "good") ??
        result.findings[0] ??
        null;

      setSelectedFinding(firstIssue);
      setAttemptedFixes([]);
      setGuidedInput("");
      setGuidedMessages([]);
    } catch (error) {
      setStatusText(
        error instanceof Error
          ? `Scan failed: ${error.message}`
          : "Scan failed.",
      );
      setCaseNotes("The scan failed before results could be generated.");
    }
  };

  const sendGuidedFixMessage = async (
    finding: ScanFinding,
    userMessage: string,
    attempted: string[],
    resetHistory = false,
  ) => {
    if (!connected) {
      setStatusText("Connect before using Guided Fix Chat.");
      return;
    }

    setIsGuidedLoading(true);
    setStatusText("SVANSAI is preparing a guided fix response...");

    const payloadMessage = `
You are SVDebugger working through SVANSAI.

Debugger Mode: ${selectedMode}
Finding Category: ${finding.category}
Finding Item: ${finding.item}
Finding Status: ${finding.status}
Issue Detail: ${finding.detail}
Suggested Fix: ${finding.fix}
Current Scan Summary: ${activeSummary}

Logs:
${logs.length > 0 ? logs.join("\n") : "No logs available."}

Recommendations:
${recommendations.length > 0 ? recommendations.join("\n") : "No recommendations available."}

Attempted Fixes:
${attempted.length > 0 ? attempted.join("\n") : "None yet."}

User request:
${userMessage}

Instructions:
- Give a practical step-by-step troubleshooting walkthrough.
- Prioritize actionable steps over explanations.
- Do not repeat previous fixes listed under "Attempted Fixes".
- If the first fix fails, continue with deeper diagnostics.
`.trim();

    try {
      if (!resetHistory) {
        setGuidedMessages((prev) => [
          ...prev,
          { role: "user", content: userMessage },
        ]);
      }

      console.log("Sending to SVANSAI:", guidedInput);
      const response = await fetch(`${SVANSAI_API_BASE_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: payloadMessage,
          config: {},
          knowledge: [],
        }),
      });
      if (!response.ok) {
        throw new Error(`SVANSAI API error: ${response.status}`);
      }

      const data = (await response.json()) as ChatApiResponse;
      console.log("SVANSAI response:", data);
      const answer =
        data.answer?.trim() ||
        data.response?.trim() ||
        "I could not generate a guided fix response right now.";

      setGuidedMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer },
      ]);
      setCaseNotes(`Guided Fix Chat updated for ${finding.item}.`);
      setStatusText("Guided Fix Chat response received.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown guided fix error.";
      setGuidedMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Guided Fix Chat failed: ${message}`,
        },
      ]);
      setStatusText("Guided Fix Chat failed.");
    } finally {
      setIsGuidedLoading(false);
    }
  };

  const openGuidedFixChat = async (finding: ScanFinding) => {
    if (!connected) {
      setStatusText("Connect before opening Guided Fix Chat.");
      return;
    }

    setSelectedFinding(finding);
    setAttemptedFixes([]);
    setGuidedInput("");
    setGuidedMessages([
      {
        role: "system",
        content:
          "Guided Fix Chat opened. Ask follow-up questions or mark fixes as attempted if they do not work.",
      },
    ]);

    await sendGuidedFixMessage(
      finding,
      "Walk me through how to fix this step by step. If the first fix does not work, continue with deeper troubleshooting.",
      [],
      true,
    );
  };

  const handleSendGuidedMessage = async () => {
    if (!selectedFinding) {
      setStatusText("Select a finding first.");
      return;
    }

    const trimmed = guidedInput.trim();
    if (!trimmed) {
      setStatusText("Enter a guided fix question first.");
      return;
    }

    setGuidedInput("");
    await sendGuidedFixMessage(selectedFinding, trimmed, attemptedFixes);
  };

  const handleMarkTried = async () => {
    if (!selectedFinding) {
      setStatusText("Select a finding first.");
      return;
    }

    const nextAttempted = [
      ...attemptedFixes,
      selectedFinding.fix || "User attempted the previously suggested fix.",
    ];

    setAttemptedFixes(nextAttempted);

    await sendGuidedFixMessage(
      selectedFinding,
      "I tried the suggested fix and it did not work. Give me the next troubleshooting steps.",
      nextAttempted,
    );
  };

  const scanButtonsDisabled = !connected || isConnecting;
  const guidedChatDisabled = !connected || !selectedFinding || isGuidedLoading;

  return (
    <div
      className="app-shell"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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
            onMouseDown={handleMouseDown}
          >
            <img
              src={svDebuggerMascot}
              alt="SV Inspector mascot"
              className="floating-mascot__img"
              draggable={false}
              onError={() => console.error("Mascot failed:", svDebuggerMascot)}
              onLoad={() => console.log("Mascot loaded:", svDebuggerMascot)}
            />
          </div>

          <div className="connection-card">
            <div className="connection-card__row">
              <span className="muted">Connection Status</span>
              <span className={connected ? "status status--ok" : "status"}>
                {connected ? "Connected" : "Waiting"}
              </span>
            </div>

            <input
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="Enter session code"
              className="input"
            />

            <div className="button-row">
              <button
                type="button"
                className="button button--primary"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect"}
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
          <section className="panel">
            <div className="panel__eyebrow">Investigation Modes</div>
            <h2 className="panel__title">Choose Scan Type</h2>

            <div className="mode-grid">
              <ModeCard
                title="Network"
                description="Analyze current network state and active connectivity."
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
                description="Analyze running apps and machine-side application health."
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

            <div className="notes-box" style={{ marginTop: 20 }}>
              <div className="notes-box__title">Guided Fix Chat</div>

              {!selectedFinding ? (
                <p className="notes-box__text">
                  Select a warning or problem finding and open Guided Fix Chat.
                </p>
              ) : (
                <>
                  <p className="notes-box__text">
                    <strong>Focused Finding:</strong> {selectedFinding.item}
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      marginTop: 12,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {guidedMessages.length === 0 ? (
                      <p className="notes-box__text">
                        No guided fix messages yet.
                      </p>
                    ) : (
                      guidedMessages.map((message, index) => (
                        <div
                          key={`${message.role}-${index}`}
                          style={{
                            border: "1px solid #27272a",
                            borderRadius: 14,
                            padding: 12,
                            background:
                              message.role === "assistant"
                                ? "#11131b"
                                : "#151a27",
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>
                            {message.role === "assistant"
                              ? "SVANSAI"
                              : message.role === "user"
                                ? "You"
                                : "System"}
                          </div>
                          <div
                            style={{ whiteSpace: "pre-wrap", color: "#d4d4d8" }}
                          >
                            {message.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <textarea
                    value={guidedInput}
                    onChange={(e) => setGuidedInput(e.target.value)}
                    placeholder="Ask how to fix this, or describe what already failed..."
                    className="input"
                    style={{
                      minHeight: 110,
                      marginTop: 14,
                      resize: "vertical",
                    }}
                    disabled={!connected}
                  />

                  <div className="action-grid" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => void handleSendGuidedMessage()}
                      disabled={guidedChatDisabled}
                    >
                      {isGuidedLoading ? "Thinking..." : "Send to SVANSAI"}
                    </button>

                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => void handleMarkTried()}
                      disabled={guidedChatDisabled}
                    >
                      I Tried That
                    </button>
                  </div>

                  {attemptedFixes.length > 0 && (
                    <p
                      className="notes-box__text"
                      style={{ marginTop: 12, whiteSpace: "pre-wrap" }}
                    >
                      <strong>Attempted Fixes:</strong>
                      {"\n"}
                      {attemptedFixes
                        .map((item, index) => `${index + 1}. ${item}`)
                        .join("\n")}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

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
                  <strong>Good</strong> {goodCount}
                </span>
                <span>
                  <strong>Warning</strong> {warningCount}
                </span>
                <span>
                  <strong>Problem</strong> {problemCount}
                </span>
              </div>

              <div className="action-grid">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={handleStartScan}
                  disabled={scanButtonsDisabled}
                >
                  Start Scan
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
              </div>
            </div>

            <div className="notes-box">
              <div className="notes-box__title">Case Notes</div>
              <p className="notes-box__text" style={{ whiteSpace: "pre-wrap" }}>
                {caseNotes}
              </p>
            </div>

            <div className="notes-box">
              <div className="notes-box__title">Findings</div>
              {findings.length === 0 ? (
                <p className="notes-box__text">No findings yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  {findings.map((finding, index) => (
                    <div
                      key={`${finding.item}-${index}`}
                      style={{
                        border: "1px solid #27272a",
                        borderRadius: 16,
                        padding: 14,
                        background: "#11131b",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        [{finding.status.toUpperCase()}] {finding.item}
                      </div>
                      <div style={{ marginTop: 6, color: "#d4d4d8" }}>
                        {finding.detail}
                      </div>
                      <div style={{ marginTop: 6, color: "#a1a1aa" }}>
                        <strong>Fix:</strong> {finding.fix}
                      </div>
                      {(finding.status === "warning" ||
                        finding.status === "problem") && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => void openGuidedFixChat(finding)}
                            disabled={!connected}
                          >
                            Open Guided Fix Chat
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
