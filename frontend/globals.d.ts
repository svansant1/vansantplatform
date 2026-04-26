export {};

declare global {
  interface Window {
    ipcRenderer?: {
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, func: (...args: unknown[]) => void) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
}