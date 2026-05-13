import type { GitStatus } from "./types";

type Props = {
  workspacePath: string | null;
  activeFilePath: string | null;
  statusMessage: string;
  gitStatus: GitStatus | null;
};

export default function StatusBar({
  workspacePath,
  activeFilePath,
  statusMessage,
  gitStatus,
}: Props) {
  const gitClassName =
    gitStatus?.isRepo && gitStatus.staged > 0
      ? "git-status git-status-staged"
      : gitStatus?.isRepo && gitStatus.clean
        ? "git-status git-status-clean"
        : "git-status";
  const gitLabel =
    gitStatus?.isRepo && gitStatus.staged > 0
      ? `✓ ${gitStatus.staged} staged`
      : gitStatus?.summary ?? "Git: unknown";

  return (
    <footer className="status-bar">
      <span>Workspace: {workspacePath ?? "Not open"}</span>
      <span>File: {activeFilePath ?? "None"}</span>
      <span className={gitClassName} title={gitStatus?.summary ?? "Git status not checked yet"}>
        {gitLabel}
      </span>
      <span>{statusMessage || "Ready"}</span>
    </footer>
  );
}
