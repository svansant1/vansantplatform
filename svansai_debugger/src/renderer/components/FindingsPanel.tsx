type FindingsPanelProps = {
  findings: ScanFinding[];
  connected: boolean;
  onOpenGuidedFixChat: (finding: ScanFinding) => void;
};

const HEALTH_LABEL: Record<HealthState, string> = {
  detected: "Detected",
  healthy: "Healthy",
  degraded: "Degraded",
  failed: "Failed",
  unknown: "Unknown",
  not_tested: "Not tested",
};

const HEALTH_STYLE: Record<HealthState, string> = {
  detected: "finding-badge--warning",
  healthy: "finding-badge--good",
  degraded: "finding-badge--warning",
  failed: "finding-badge--problem",
  unknown: "finding-badge--warning",
  not_tested: "finding-badge--warning",
};

function healthForFinding(finding: ScanFinding): HealthState {
  if (finding.health) return finding.health;
  if (finding.status === "problem") return "failed";
  if (finding.status === "warning") return "degraded";
  return "healthy";
}

export function FindingsPanel({
  findings,
  connected,
  onOpenGuidedFixChat,
}: FindingsPanelProps) {
  if (findings.length === 0) {
    return <p className="notes-box__text">No findings yet.</p>;
  }

  return (
    <div className="findings-list">
      {findings.map((finding, index) => {
        const health = healthForFinding(finding);
        return (
        <div key={`${finding.item}-${index}`} className="finding-card">
          <div className="finding-card__header">
            <span className={`finding-badge ${HEALTH_STYLE[health]}`}>
              {HEALTH_LABEL[health]}
            </span>
            <span className="finding-card__item">{finding.item}</span>
          </div>

          <div className="finding-card__category">{finding.category}</div>
          <div className="finding-card__detail">{finding.detail}</div>

          {typeof finding.confidence === "number" && (
            <div className="finding-card__category">
              Confidence: {Math.round(finding.confidence * 100)}%
              {finding.detector ? ` · ${finding.detector}` : ""}
            </div>
          )}

          {finding.evidence && finding.evidence.length > 0 && (
            <details className="finding-card__evidence">
              <summary>Evidence ({finding.evidence.length})</summary>
              <ul>
                {finding.evidence.map((item, evidenceIndex) => (
                  <li key={`${item.signal}-${evidenceIndex}`}>
                    {item.signal}
                    {item.value !== undefined ? `: ${String(item.value)}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {finding.fix && finding.fix !== "No action needed." && (
            <div className="finding-card__fix">
              <strong>Fix:</strong> {finding.fix}
            </div>
          )}

          {health !== "healthy" && health !== "detected" && (
            <div className="finding-card__actions">
              <button
                type="button"
                className="button button--secondary"
                disabled={!connected}
                onClick={() => onOpenGuidedFixChat(finding)}
              >
                Open Guided Fix Chat
              </button>
            </div>
          )}
        </div>
      )})}
    </div>
  );
}
