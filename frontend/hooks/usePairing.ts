"use client";

import { useCallback, useEffect, useState } from "react";
import { createPairCode, getPairStatus } from "../services/pairingService";
import type {
  CreatePairCodeResponse,
  PairStatusResponse,
} from "../types/pairing";

export function usePairing() {
  const [pairing, setPairing] = useState<CreatePairCodeResponse | null>(null);
  const [status, setStatus] = useState<PairStatusResponse | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(async () => {
    setIsCreating(true);

    try {
      const result = await createPairCode();
      setPairing(result);

      if (!result.ok) {
        setStatus({
          ok: false,
          error: result.error || "Failed to create pair code.",
        });
      } else {
        setStatus({
          ok: true,
          code: result.code,
          connected: result.connected,
          expires_at: result.expires_at,
          device_name: null,
          used: false,
        });
      }

      return result;
    } finally {
      setIsCreating(false);
    }
  }, []);

  useEffect(() => {
    if (!pairing?.code) return;

    const interval = setInterval(async () => {
      const result = await getPairStatus(pairing.code || "");
      setStatus(result);
    }, 2000);

    return () => clearInterval(interval);
  }, [pairing?.code]);

  return {
    pairing,
    status,
    isCreating,
    createPairCode: create,
  };
}