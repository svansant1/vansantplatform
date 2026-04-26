import type { SandboxApi } from '../../../preload/index';

declare global {
  interface Window {
    sandboxApi: SandboxApi;
  }
}
declare module "*.css";

type SandboxApi = import("../../preload/index").SandboxApi;

interface Window {
  sandboxApi: SandboxApi;
}
export {};
