import type {
  CreatePairCodeResponse,
  DebuggerConnectResponse,
  PairStatusResponse,
} from "../types/pairing";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function normalizeCreatePairCodeResponse(
  payload: Partial<CreatePairCodeResponse> | null | undefined,
): CreatePairCodeResponse {
  return {
    ok: Boolean(payload?.ok),
    code: payload?.code ?? "",
    expires_at: payload?.expires_at ?? "",
    connected: Boolean(payload?.connected),
    error: payload?.error ?? undefined,
  };
}

function normalizePairStatusResponse(
  payload: Partial<PairStatusResponse> | null | undefined,
): PairStatusResponse {
  return {
    ok: Boolean(payload?.ok),
    code: payload?.code ?? "",
    connected: Boolean(payload?.connected),
    device_name: payload?.device_name ?? null,
    expires_at: payload?.expires_at ?? "",
    used: Boolean(payload?.used),
    error: payload?.error ?? undefined,
  };
}

function normalizeConnectResponse(
  payload: Partial<DebuggerConnectResponse> | null | undefined,
): DebuggerConnectResponse {
  return {
    ok: Boolean(payload?.ok),
    message: payload?.message ?? "",
    device_name: payload?.device_name ?? "",
    code: payload?.code ?? "",
    error: payload?.error ?? undefined,
  };
}

export async function createPairCode(): Promise<CreatePairCodeResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debugger/create-pair-code`, {
      method: "POST",
    });

    const data = await response.json();
    return normalizeCreatePairCodeResponse(data);
  } catch (error) {
    return normalizeCreatePairCodeResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create pair code.",
    });
  }
}

export async function getPairStatus(
  code: string,
): Promise<PairStatusResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/debugger/pair-status/${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );

    const data = await response.json();
    return normalizePairStatusResponse(data);
  } catch (error) {
    return normalizePairStatusResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load pair status.",
    });
  }
}

export async function connectDebugger(
  code: string,
  deviceName: string,
): Promise<DebuggerConnectResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/debugger/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        device_name: deviceName,
      }),
    });

    const data = await response.json();
    return normalizeConnectResponse(data);
  } catch (error) {
    return normalizeConnectResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to connect debugger.",
    });
  }
}