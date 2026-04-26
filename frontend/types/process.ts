export type RunningProcess = {
  pid?: number;
  name?: string;
  exe?: string;
};

export type ProcessListResponse = {
  ok: boolean;
  processes: RunningProcess[];
  error?: string;
};