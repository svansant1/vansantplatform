import { useEffect, useRef, useState } from "react";
import { SVANSAI_API_BASE_URL } from "../../shared/constants/api";
import type { ScanMode } from "../../shared/types/scan";

type SetString = (s: string) => void;
const GUIDED_CHAT_TIMEOUT_MS = 30000;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatApiResponse = {
  answer?: string;
  response?: string;
};

type Params = {
  connected: boolean;
  selectedMode: ScanMode;
  activeSummary: string;
  logs: string[];
  recommendations: string[];
  setStatusText: SetString;
  setCaseNotes: SetString;
};

function getFindingKey(finding: ScanFinding): string {
  return [
    finding.category,
    finding.item,
    finding.status,
    finding.detail,
  ]
    .join("|")
    .toLowerCase();
}

function normalizeAnswer(data: ChatApiResponse, finding: ScanFinding): string {
  const answer = data.answer?.trim() || data.response?.trim() || "";

  if (answer.length > 0) {
    return answer;
  }

  return [
    `I could not get a complete SVANSAI response for **${finding.item}**.`,
    "",
    "Try this first:",
    "1. Re-run the scan to confirm the finding is still present.",
    "2. Review the finding detail and suggested fix shown above.",
    "3. Ask a narrower follow-up, such as what changed right before the issue started.",
  ].join("\n");
}

async function fetchGuidedAnswer(prompt: string): Promise<ChatApiResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), GUIDED_CHAT_TIMEOUT_MS);

  try {
    const response = await fetch(`${SVANSAI_API_BASE_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        config: {},
        knowledge: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`SVANSAI API error: ${response.status}`);
    }

    return (await response.json()) as ChatApiResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("SVANSAI took too long to respond. Try again in a moment.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function useGuidedChat({
  connected,
  selectedMode,
  activeSummary,
  logs,
  recommendations,
  setStatusText,
  setCaseNotes,
}: Params) {
  const [selectedFinding, setSelectedFinding] = useState<ScanFinding | null>(null);
  const [attemptedFixes, setAttemptedFixes] = useState<string[]>([]);
  const [guidedInput, setGuidedInput] = useState("");
  const [guidedMessages, setGuidedMessages] = useState<ChatMessage[]>([]);
  const [isGuidedLoading, setIsGuidedLoading] = useState(false);

  // Avoids stale closures in async sendMessage
  const guidedMessagesRef = useRef<ChatMessage[]>([]);
  // Per-finding chat history persisted across finding switches
  const chatHistoryMap = useRef(new Map<string, ChatMessage[]>());
  const attemptedFixesMap = useRef(new Map<string, string[]>());

  const setMessages = (
    msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => {
    setGuidedMessages((prev) => {
      const next = typeof msgs === "function" ? msgs(prev) : msgs;
      guidedMessagesRef.current = next;
      return next;
    });
  };

  // Keep chatHistoryMap in sync whenever messages change
  useEffect(() => {
    if (selectedFinding) {
      chatHistoryMap.current.set(getFindingKey(selectedFinding), guidedMessages);
    }
  }, [guidedMessages, selectedFinding]);

  useEffect(() => {
    if (selectedFinding) {
      attemptedFixesMap.current.set(getFindingKey(selectedFinding), attemptedFixes);
    }
  }, [attemptedFixes, selectedFinding]);

  const reset = (nextFinding: ScanFinding | null = null) => {
    setSelectedFinding(nextFinding);
    setAttemptedFixes([]);
    setGuidedInput("");
    setMessages([]);
  };

  const sendMessage = async (
    finding: ScanFinding,
    userMessage: string,
    attempted: string[],
    resetHistory = false,
  ) => {
    if (!connected) {
      setStatusText("Connect before using Guided Fix Chat.");
      return;
    }

    setIsGuidedLoading(true);
    setStatusText("SVANSAI is preparing a guided fix response...");

    const priorConversation = (resetHistory ? [] : guidedMessagesRef.current)
      .filter((msg) => msg.role !== "system")
      .map((msg) =>
        msg.role === "assistant"
          ? `SVANSAI: ${msg.content}`
          : `User: ${msg.content}`,
      )
      .join("\n\n");

    const payloadMessage = `You are SVDebugger working through SVANSAI.

Debugger Mode: ${selectedMode}
Finding Category: ${finding.category}
Finding Item: ${finding.item}
Finding Status: ${finding.status}
Issue Detail: ${finding.detail}
Suggested Fix: ${finding.fix}
Current Scan Summary: ${activeSummary}

Logs:
${logs.length > 0 ? logs.join("\n") : "No logs available."}

Recommendations:
${recommendations.length > 0 ? recommendations.join("\n") : "No recommendations available."}

Attempted Fixes:
${attempted.length > 0 ? attempted.join("\n") : "None yet."}
${priorConversation ? `\nConversation so far:\n${priorConversation}\n` : ""}
User request:
${userMessage}

Instructions:
- Give a practical step-by-step troubleshooting walkthrough.
- Prioritize actionable steps over explanations.
- Use markdown: numbered lists for steps, code blocks for commands, bold for emphasis.
- Do not repeat any steps already listed under "Attempted Fixes" or covered in "Conversation so far".
- If the first fix fails, continue with deeper diagnostics.`.trim();

    try {
      if (!resetHistory) {
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      }

      const data = await fetchGuidedAnswer(payloadMessage);
      const answer = normalizeAnswer(data, finding);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer },
      ]);
      setCaseNotes(`Guided Fix Chat updated for ${finding.item}.`);
      setStatusText("Guided Fix Chat response received.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown guided fix error.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: [
            `I could not reach SVANSAI for this guided fix: ${message}`,
            "",
            "You can retry, or continue from the visible scan details:",
            `1. Confirm the finding is still present: **${finding.item}**.`,
            "2. Try the suggested fix shown in the finding card.",
            "3. Re-run the scan and send me what changed.",
          ].join("\n"),
        },
      ]);
      setStatusText("Guided Fix Chat failed.");
    } finally {
      setIsGuidedLoading(false);
    }
  };

  const openGuidedFixChat = async (finding: ScanFinding) => {
    if (!connected) {
      setStatusText("Connect before opening Guided Fix Chat.");
      return;
    }

    const findingKey = getFindingKey(finding);
    const savedHistory = chatHistoryMap.current.get(findingKey);
    const savedAttemptedFixes = attemptedFixesMap.current.get(findingKey) ?? [];
    if (savedHistory && savedHistory.length > 0) {
      setSelectedFinding(finding);
      setAttemptedFixes(savedAttemptedFixes);
      setGuidedInput("");
      setMessages(savedHistory);
      setStatusText(`Restored chat history for ${finding.item}.`);
      return;
    }

    setSelectedFinding(finding);
    setAttemptedFixes([]);
    setGuidedInput("");
    setMessages([
      {
        role: "system",
        content:
          "Guided Fix Chat opened. Ask follow-up questions or mark fixes as attempted if they do not work.",
      },
    ]);

    await sendMessage(
      finding,
      "Walk me through how to fix this step by step. If the first fix does not work, continue with deeper troubleshooting.",
      [],
      true,
    );
  };

  const handleSendMessage = async () => {
    if (!selectedFinding) {
      setStatusText("Select a finding first.");
      return;
    }

    const trimmed = guidedInput.trim();
    if (!trimmed) {
      setStatusText("Enter a guided fix question first.");
      return;
    }

    setGuidedInput("");
    await sendMessage(selectedFinding, trimmed, attemptedFixes);
  };

  const handleMarkTried = async () => {
    if (!selectedFinding) {
      setStatusText("Select a finding first.");
      return;
    }

    const nextAttempted = [
      ...attemptedFixes,
      selectedFinding.fix || "User attempted the previously suggested fix.",
    ];

    setAttemptedFixes(nextAttempted);

    await sendMessage(
      selectedFinding,
      "I tried the suggested fix and it did not work. Give me the next troubleshooting steps.",
      nextAttempted,
    );
  };

  return {
    selectedFinding,
    setSelectedFinding,
    attemptedFixes,
    guidedInput,
    setGuidedInput,
    guidedMessages,
    isGuidedLoading,
    reset,
    openGuidedFixChat,
    handleSendMessage,
    handleMarkTried,
  };
}
