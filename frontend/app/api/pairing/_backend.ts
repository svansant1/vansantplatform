const BACKEND_URL = (
  process.env.PAIRING_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://vansant-backend.onrender.com"
).replace(/\/$/, "");

export async function proxyPairingRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      cache: "no-store",
    });
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "The Vansant pairing service is temporarily unavailable. Please try again.",
      },
      { status: 502 },
    );
  }
}
