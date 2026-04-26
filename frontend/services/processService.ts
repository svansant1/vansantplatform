import type { ProcessListResponse, RunningProcess } from "../types/process";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://vansant-backend.onrender.com";

function normalizeProcess(
  payload: Partial<RunningProcess> | null | undefined,
): RunningProcess {
  return {
    pid: typeof payload?.pid === "number" ? payload.pid : undefined,
    name: payload?.name ?? "",
    exe: payload?.exe ?? "",
  };
}

function normalizeProcessListResponse(
  payload: Partial<ProcessListResponse> | null | undefined,
): ProcessListResponse {
  return {
    ok: Boolean(payload?.ok),
    processes: Array.isArray(payload?.processes)
      ? payload.processes.map((proc) => normalizeProcess(proc))
      : [],
    error: payload?.error ?? undefined,
  };
}

export async function listDebugProcesses(): Promise<ProcessListResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debug/processes`, {
      cache: "no-store",
    });

    const data = await response.json();
    return normalizeProcessListResponse(data);
  } catch (error) {
    return normalizeProcessListResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list running processes.",
    });
  }
}