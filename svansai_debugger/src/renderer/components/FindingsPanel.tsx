type FindingsPanelProps = {
  findings: ScanFinding[];
  connected: boolean;
  onOpenGuidedFixChat: (finding: ScanFinding) => void;
};

const STATUS_LABEL: Record<ScanStatus, string> = {
  good: "Good",
  warning: "Warning",
  problem: "Problem",
};

const STATUS_STYLE: Record<ScanStatus, string> = {
  good: "finding-badge--good",
  warning: "finding-badge--warning",
  problem: "finding-badge--problem",
};

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
      {findings.map((finding, index) => (
        <div key={`${finding.item}-${index}`} className="finding-card">
          <div className="finding-card__header">
            <span className={`finding-badge ${STATUS_STYLE[finding.status]}`}>
              {STATUS_LABEL[finding.status]}
            </span>
            <span className="finding-card__item">{finding.item}</span>
          </div>

          <div className="finding-card__category">{finding.category}</div>
          <div className="finding-card__detail">{finding.detail}</div>

          {finding.fix && finding.fix !== "No action needed." && (
            <div className="finding-card__fix">
              <strong>Fix:</strong> {finding.fix}
            </div>
          )}

          {(finding.status === "warning" || finding.status === "problem") && (
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
      ))}
    </div>
  );
}
