type LogsPanelProps = {
  logs: string[];
};

export function LogsPanel({ logs }: LogsPanelProps) {
  if (logs.length === 0) {
    return <p className="notes-box__text">No logs available yet.</p>;
  }

  return <pre className="logs-panel">{logs.join("\n")}</pre>;
}
