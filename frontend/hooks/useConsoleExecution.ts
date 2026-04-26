"use client";

import { useCallback, useState } from "react";
import { runDebugCommand } from "../services/debuggerService";

export function useConsoleExecution() {
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCommand = useCallback(async (command: string, cwd?: string) => {
    setIsRunning(true);
    setError(null);

    try {
      const result = await runDebugCommand(command, cwd);

      if (!result.ok) {
        const message = result.error || "Command execution failed.";
        setError(message);
        setOutput(message);
        return result;
      }

      const combined = [
        `> ${command}`,
        result.message || "",
        result.cwd ? `Working Directory: ${result.cwd}` : "",
        result.pid ? `PID: ${result.pid}` : "",
        result.stdout || "",
        result.stderr || "",
        result.returncode !== undefined
          ? `Exit Code: ${result.returncode}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      setOutput(combined || "> Command completed with no output.");
      return result;
    } catch {
      const message = "Command execution failed.";
      setError(message);
      setOutput(message);
      return { ok: false, error: message };
    } finally {
      setIsRunning(false);
    }
  }, []);

  return {
    output,
    isRunning,
    error,
    runCommand,
  };
}