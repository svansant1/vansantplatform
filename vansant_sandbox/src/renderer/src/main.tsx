import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

(
  self as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker: (_: unknown, label: string) => Worker;
    };
  }
).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "typescript" || label === "javascript") {
      return new Worker(
        new URL("./monaco-workers/ts.worker.ts", import.meta.url),
        { type: "module" },
      );
    }

    if (label === "json") {
      return new Worker(
        new URL("./monaco-workers/json.worker.ts", import.meta.url),
        { type: "module" },
      );
    }

    if (label === "css" || label === "scss" || label === "less") {
      return new Worker(
        new URL("./monaco-workers/css.worker.ts", import.meta.url),
        { type: "module" },
      );
    }

    if (label === "html" || label === "handlebars" || label === "razor") {
      return new Worker(
        new URL("./monaco-workers/html.worker.ts", import.meta.url),
        { type: "module" },
      );
    }

    return new Worker(
      new URL("./monaco-workers/editor.worker.ts", import.meta.url),
      { type: "module" },
    );
  },
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
