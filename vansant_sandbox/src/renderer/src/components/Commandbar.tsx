import { useEffect, useRef } from "react";

type QuickOpenFile = {
  name: string;
  path: string;
  relativePath: string;
};

type Props = {
  open: boolean;
  query: string;
  files: QuickOpenFile[];
  selectedIndex: number;
  onQueryChange: (query: string) => void;
  onSelectIndex: (index: number) => void;
  onOpenFile: (path: string) => void;
  onClose: () => void;
};

export default function Commandbar({
  open,
  query,
  files,
  selectedIndex,
  onQueryChange,
  onSelectIndex,
  onOpenFile,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const selectedFile = files[selectedIndex] ?? null;

  return (
    <div className="commandbar-backdrop" onMouseDown={onClose}>
      <div
        className="commandbar"
        role="dialog"
        aria-label="Quick open file"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="commandbar-input"
          value={query}
          placeholder="Search files by name..."
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              onSelectIndex(Math.min(selectedIndex + 1, files.length - 1));
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              onSelectIndex(Math.max(selectedIndex - 1, 0));
              return;
            }

            if (event.key === "Enter" && selectedFile) {
              event.preventDefault();
              onOpenFile(selectedFile.path);
            }
          }}
        />

        <div className="commandbar-results">
          {files.length === 0 ? (
            <div className="commandbar-empty">
              {query.trim() ? "No matching files." : "Start typing to filter files."}
            </div>
          ) : (
            files.map((file, index) => (
              <button
                key={file.path}
                type="button"
                className={`commandbar-result ${
                  index === selectedIndex ? "commandbar-result-active" : ""
                }`}
                onMouseEnter={() => onSelectIndex(index)}
                onClick={() => onOpenFile(file.path)}
              >
                <span className="commandbar-result-name">{file.name}</span>
                <span className="commandbar-result-path">{file.relativePath}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
