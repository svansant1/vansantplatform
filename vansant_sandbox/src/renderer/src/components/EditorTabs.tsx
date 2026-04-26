import type { OpenTab } from "./types";

type Props = {
  tabs: OpenTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

export default function EditorTabs({
  tabs,
  activePath,
  onSelect,
  onClose,
}: Props) {
  return (
    <div className="editor-tabs">
      {tabs.length === 0 ? (
        <div className="editor-tab-placeholder">
          Open a file to start editing.
        </div>
      ) : (
        tabs.map((tab) => (
          <div
            key={tab.path}
            className={`editor-tab ${activePath === tab.path ? "editor-tab-active" : ""}`}
          >
            <button
              type="button"
              className="editor-tab-select"
              onClick={() => onSelect(tab.path)}
              title={tab.path}
            >
              {tab.name}
              {tab.isDirty ? " •" : ""}
            </button>
            <button
              type="button"
              className="editor-tab-close"
              onClick={() => onClose(tab.path)}
              aria-label={`Close ${tab.name}`}
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}
