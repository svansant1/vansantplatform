"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LiveLogMessage = {
  cpu_usage?: number;
  memory?: number;
  threats?: unknown;
  intel_feed?: unknown;
};

const WS_BASE_URL = "ws://127.0.0.1:8000/ws/svansai";

export function useLiveLogs() {
  const [messages, setMessages] = useState<LiveLogMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current) return;

    const socket = new WebSocket(WS_BASE_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as LiveLogMessage;
        setMessages((current) => [...current, parsed]);
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      socketRef.current = null;
    };

    socket.onerror = () => {
      setIsConnected(false);
    };
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setIsConnected(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return {
    messages,
    isConnected,
    connect,
    disconnect,
    clearMessages,
  };
}