import type { Problem } from "./types";

type Props = {
  problems: Problem[];
  onSelect: (problem: Problem) => void;
  emptyMessage: string;
};

export default function ProblemList({ problems, onSelect, emptyMessage }: Props) {
  if (!problems.length) return <div className="problems-empty">{emptyMessage}</div>;

  return (
    <div className="problems-list">
      {problems.map((problem, index) => (
        <div className="problem-item" key={`${problem.file}:${problem.line}:${index}`}>
          <span className={`problem-severity problem-${problem.severity}`}>{problem.severity}</span>
          {problem.file && problem.line && !problem.file.startsWith("<") ? (
            <button
              type="button"
              className="problem-location problem-link"
              title={`Open ${problem.file} at line ${problem.line}${problem.column ? `, column ${problem.column}` : ""}`}
              onClick={() => onSelect(problem)}
            >
              {problem.file.split(/[/\\]/).pop()}
              <span>Line {problem.line}{problem.column ? `, column ${problem.column}` : ""}</span>
            </button>
          ) : (
            <span className="problem-location">{problem.file ?? "Run output"}</span>
          )}
          <div className="problem-message">
            {problem.message}
            {problem.source || problem.code ? (
              <span className="problem-source">{[problem.source, problem.code].filter(Boolean).join(" ")}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
