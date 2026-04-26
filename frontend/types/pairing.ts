export type CreatePairCodeResponse = {
  ok: boolean;
  code?: string;
  expires_at?: string;
  connected?: boolean;
  error?: string;
};

export type PairStatusResponse = {
  ok: boolean;
  code?: string;
  connected?: boolean;
  device_name?: string | null;
  expires_at?: string;
  used?: boolean;
  error?: string;
};

export type DebuggerConnectResponse = {
  ok: boolean;
  message?: string;
  device_name?: string;
  code?: string;
  error?: string;
};