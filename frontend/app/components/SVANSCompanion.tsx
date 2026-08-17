"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type RecognitionResult = ArrayLike<{
  isFinal: boolean;
  0: { transcript: string };
}>;
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: Event & { results: RecognitionResult }) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

const HISTORY_KEY = "vansant-platform-svans-conversation";
const SESSION_KEY = "vansant-platform-svans-session";
const starters = [
  "Give me a platform status overview",
  "Walk me through what I can do here",
  "Help me plan my next SVANS project step",
];

export default function SVANSCompanion() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice standby");
  const messagesRef = useRef<Message[]>([]);
  const recognitionRef = useRef<Recognition | null>(null);
  const voiceOnRef = useRef(false);
  const loadingRef = useRef(false);
  const speakingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startRecognitionRef = useRef<() => void>(() => undefined);
  const sendMessageRef = useRef<(message?: string) => void>(() => undefined);

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "server";
    let value = sessionStorage.getItem(SESSION_KEY);
    if (!value) {
      value = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, value);
    }
    return value;
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) setMessages(parsed.slice(-20));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-20)));
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const speak = useCallback((text: string, resume: () => void) => {
    if (!("speechSynthesis" in window)) {
      resume();
      return;
    }
    speakingRef.current = true;
    setVoiceStatus("SVANS is speaking…");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 0.94;
    utterance.onend = () => {
      speakingRef.current = false;
      setVoiceStatus("Listening…");
      resume();
    };
    utterance.onerror = utterance.onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendMessage = useCallback(
    async (rawMessage?: string) => {
      const content = (rawMessage ?? input).trim();
      if (!content || loadingRef.current) return;

      const nextMessages = [
        ...messagesRef.current,
        { role: "user" as const, content },
      ].slice(-40);
      setMessages(nextMessages);
      setInput("");
      setLoading(true);
      loadingRef.current = true;
      setVoiceStatus("SVANS is thinking…");

      try {
        const response = await fetch("/api/svans/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages, sessionId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "SVANS is unavailable.");

        const reply = String(data.text);
        const complete = [
          ...nextMessages,
          { role: "assistant" as const, content: reply },
        ];
        messagesRef.current = complete;
        setMessages(complete);
        if (voiceOnRef.current) {
          speak(reply, () => startRecognitionRef.current());
        } else {
          setVoiceStatus("Voice standby");
        }
      } catch (error) {
        const reply =
          error instanceof Error ? error.message : "The connection was interrupted.";
        const complete = [
          ...nextMessages,
          { role: "assistant" as const, content: reply },
        ];
        messagesRef.current = complete;
        setMessages(complete);
        setVoiceStatus("Connection interrupted");
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [input, sessionId, speak],
  );

  const startRecognition = useCallback(() => {
    if (
      !voiceOnRef.current ||
      loadingRef.current ||
      speakingRef.current ||
      recognitionRef.current
    ) {
      return;
    }
    const RecognitionApi =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionApi) {
      setVoiceOn(false);
      voiceOnRef.current = false;
      setVoiceStatus("Voice input is not supported in this browser");
      return;
    }

    const recognition = new RecognitionApi();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognitionRef.current = recognition;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) finalText += `${result[0]?.transcript ?? ""} `;
      }
      if (finalText.trim()) {
        recognition.stop();
        void sendMessageRef.current(finalText.trim());
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        voiceOnRef.current = false;
        setVoiceOn(false);
        setVoiceStatus("Microphone permission is required");
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (voiceOnRef.current && !loadingRef.current && !speakingRef.current) {
        window.setTimeout(() => startRecognitionRef.current(), 450);
      }
    };
    try {
      recognition.start();
      setListening(true);
      setVoiceStatus("Listening…");
    } catch {
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
    sendMessageRef.current = sendMessage;
  }, [sendMessage, startRecognition]);

  useEffect(
    () => () => {
      voiceOnRef.current = false;
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  const toggleVoice = () => {
    if (voiceOn) {
      voiceOnRef.current = false;
      setVoiceOn(false);
      stopRecognition();
      window.speechSynthesis?.cancel();
      speakingRef.current = false;
      setVoiceStatus("Voice standby");
      return;
    }
    setOpen(true);
    voiceOnRef.current = true;
    setVoiceOn(true);
    setVoiceStatus("Connecting microphone…");
    startRecognition();
  };

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-3">
      {open && (
        <section className="flex h-[min(610px,calc(100vh-8rem))] w-[380px] max-w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 text-white shadow-2xl backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-purple-500 to-orange-400 shadow-lg">
                <Sparkles size={18} />
              </span>
              <div>
                <h2 className="text-sm font-black tracking-wide">SVANS</h2>
                <p className="text-[11px] text-zinc-400">Vansant ecosystem companion</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close SVANS" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
              <X size={17} />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm leading-6 text-zinc-200">Talk naturally or type anything. SVANS uses the same conversational intelligence as SVANSAI.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {starters.map((starter) => (
                    <button key={starter} onClick={() => void sendMessage(starter)} className="rounded-full border border-zinc-700 px-3 py-2 text-left text-[11px] text-zinc-300 hover:border-purple-400/60 hover:bg-purple-500/10">
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-gradient-to-r from-purple-500 to-orange-400 text-white" : "border border-white/10 bg-white/[0.05] text-zinc-200"}`}>
                    {message.content}
                  </div>
                </div>
              ))
            )}
            {loading && <div className="text-xs font-semibold text-purple-300">SVANS is thinking…</div>}
          </div>

          <div className="border-t border-white/10 p-4">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div>
                <p className={`text-xs font-bold ${listening ? "text-purple-300" : "text-zinc-300"}`}>{voiceStatus}</p>
                <p className="text-[10px] text-zinc-500">Hands-free replies continue until you end voice mode.</p>
              </div>
              <button onClick={toggleVoice} className={`rounded-full p-2.5 ${voiceOn ? "bg-purple-500 text-white" : "bg-zinc-800 text-zinc-300"}`} aria-pressed={voiceOn} aria-label={voiceOn ? "End voice conversation" : "Start voice conversation"}>
                {voiceOn ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
            </div>
            <div className="flex gap-2">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={2} placeholder="Talk to SVANS…" className="min-w-0 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400" />
              <button onClick={() => void sendMessage()} disabled={loading || !input.trim()} aria-label="Send message" className="self-stretch rounded-xl bg-gradient-to-b from-purple-500 to-orange-400 px-3 text-white disabled:opacity-40">
                <Send size={18} />
              </button>
            </div>
          </div>
        </section>
      )}

      <button onClick={() => setOpen((value) => !value)} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white shadow-2xl transition hover:-translate-y-0.5 hover:border-purple-400/40" aria-label="Open SVANS companion">
        <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-purple-500 to-orange-400">
          <Sparkles size={17} />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-emerald-400" />
        </span>
        <span className="text-left">
          <span className="block text-xs font-black tracking-wider">SVANS</span>
          <span className="block text-[10px] text-zinc-400">Talk or type</span>
        </span>
      </button>
    </div>
  );
}
