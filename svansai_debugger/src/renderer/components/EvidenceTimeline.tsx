type EvidenceTimelineProps = {
  findings: ScanFinding[];
};

export function EvidenceTimeline({ findings }: EvidenceTimelineProps) {
  const events = findings
    .flatMap((finding) =>
      (finding.evidence || []).map((item) => ({ ...item, finding: finding.item })),
    )
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .slice(0, 100);

  const coverageGaps = findings.filter(
    (finding) => finding.health === "unknown" || finding.health === "not_tested",
  );

  if (events.length === 0 && coverageGaps.length === 0) return null;

  return (
    <div className="notes-box">
      <div className="notes-box__title">Evidence Timeline</div>
      {coverageGaps.length > 0 && (
        <p className="notes-box__text">
          Coverage gaps: {coverageGaps.map((finding) => finding.item).join(", ")}
        </p>
      )}
      <div className="history-list">
        {events.map((event, index) => (
          <div className="history-entry" key={`${event.observedAt}-${event.signal}-${index}`}>
            <span className="history-entry__time">
              {new Date(event.observedAt).toLocaleTimeString()}
            </span>
            <span className="history-entry__scope">{event.source}</span>
            <span className="history-entry__counts">
              {event.finding}: {event.signal}
              {event.value !== undefined ? ` = ${String(event.value)}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
