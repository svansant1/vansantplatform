type FindingsPanelProps = {
  findings: ScanFinding[];
};

function statusLabel(status: ScanStatus): string {
  switch (status) {
    case "good":
      return "Good";
    case "warning":
      return "Warning";
    case "problem":
      return "Problem";
    default:
      return "Unknown";
  }
}

export function FindingsPanel({ findings }: FindingsPanelProps) {
  if (findings.length === 0) {
    return <p className="notes-box__text">No findings available yet.</p>;
  }

  return (
    <div className="findings-list">
      {findings.map((finding, index) => (
        <div key={`${finding.item}-${index}`} className="finding-card">
          <div className="finding-card__header">
            <span className={`finding-badge finding-badge--${finding.status}`}>
              {statusLabel(finding.status)}
            </span>
            <span className="finding-card__item">{finding.item}</span>
          </div>
          <div className="finding-card__category">{finding.category}</div>
          <div className="finding-card__detail">{finding.detail}</div>
        </div>
      ))}
    </div>
  );
}
