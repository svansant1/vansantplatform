type Props = {
  workspacePath: string | null;
  activeFilePath: string | null;
  statusMessage: string;
};

export default function StatusBar({
  workspacePath,
  activeFilePath,
  statusMessage,
}: Props) {
  return (
    <footer className="status-bar">
      <span>Workspace: {workspacePath ?? "Not open"}</span>
      <span>File: {activeFilePath ?? "None"}</span>
      <span>{statusMessage || "Ready"}</span>
    </footer>
  );
}
