export type FileReadResponse = {
  ok: boolean;
  path?: string;
  content?: string;
  error?: string;
};