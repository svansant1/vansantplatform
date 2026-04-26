import type { FileReadResponse } from "../types/file";

const API_BASE_URL = "https://vansant-backend.onrender.com";

function normalizeFileReadResponse(
  payload: Partial<FileReadResponse> | null | undefined,
): FileReadResponse {
  return {
    ok: Boolean(payload?.ok),
    path: payload?.path ?? "",
    content: payload?.content ?? "",
    error: payload?.error ?? undefined,
  };
}

export async function readDebugFile(path: string): Promise<FileReadResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debug/read-file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    });

    const data = await response.json();
    return normalizeFileReadResponse(data);
  } catch (error) {
    return normalizeFileReadResponse({
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to read file.",
    });
  }
}