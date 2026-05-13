import { useState } from "react";
import { PLATFORM_API_BASE_URL } from "../../shared/constants/api";

type SetString = (s: string) => void;

type ClaimResponse = {
  ok: boolean;
  message?: string;
  error?: string;
};

export function useConnection(setStatusText: SetString, setCaseNotes: SetString) {
  const [sessionCode, setSessionCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    const trimmedCode = sessionCode.trim().toUpperCase();

    if (!trimmedCode) {
      setConnected(false);
      setStatusText("Enter a session code first.");
      return;
    }

    setIsConnecting(true);
    setStatusText("Connecting to Platform backend...");

    try {
      const response = await fetch(`${PLATFORM_API_BASE_URL}/debugger/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmedCode, device_name: "This-PC" }),
      });

      const data = (await response.json()) as ClaimResponse;

      if (data.ok) {
        setConnected(true);
        setStatusText(data.message || "Connected successfully.");
        setCaseNotes(
          "Debugger session connected through the Platform backend. Scans and Guided Fix Chat are now unlocked.",
        );
      } else {
        setConnected(false);
        setStatusText(data.error || "Connection failed.");
        setCaseNotes("Connection failed. Enter a valid session code before scanning.");
      }
    } catch (error) {
      setConnected(false);
      setStatusText(
        error instanceof Error
          ? `Connection failed: ${error.message}`
          : "Connection failed.",
      );
      setCaseNotes(
        "Connection failed. Verify the Platform backend is running and try again.",
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setConnected(false);
    setSessionCode("");
    setStatusText("Disconnected.");
  };

  return {
    sessionCode,
    setSessionCode,
    connected,
    isConnecting,
    handleConnect,
    disconnect,
  };
}
