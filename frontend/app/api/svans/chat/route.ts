import { NextResponse } from "next/server";

type Message = { role: "user" | "assistant"; content: string };

const DEFAULT_CHAT_ENDPOINT = "https://svansai.com/api/chat";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = (Array.isArray(body?.messages) ? body.messages : [])
      .filter(
        (message: unknown): message is Message =>
          Boolean(message) &&
          typeof (message as Message).content === "string" &&
          ((message as Message).role === "user" ||
            (message as Message).role === "assistant"),
      )
      .slice(-40)
      .map((message: Message) => ({
        role: message.role,
        content: message.content.trim().slice(0, 30_000),
      }));

    if (!messages.some((message: Message) => message.role === "user")) {
      return NextResponse.json(
        { error: "A user message is required." },
        { status: 400 },
      );
    }

    const endpoint =
      process.env.SVANSAI_CHAT_ENDPOINT?.trim() || DEFAULT_CHAT_ENDPOINT;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        sessionId:
          typeof body?.sessionId === "string" ? body.sessionId : undefined,
        responseMode: "auto",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "SVANS is temporarily unavailable." },
        { status: response.status },
      );
    }

    const text = data?.text ?? data?.response ?? data?.answer ?? data?.message;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "SVANS returned an empty response." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { text: text.trim(), orchestration: data?.orchestration },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "SVANS took too long to respond. Please try again."
          : "The SVANS connection was interrupted.",
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
