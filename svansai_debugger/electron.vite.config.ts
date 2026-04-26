import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      lib: {
        entry: path.resolve(__dirname, "src/main/main.ts"),
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      lib: {
        entry: path.resolve(__dirname, "preload.ts"),
      },
    },
  },
  renderer: {
    root: path.resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, "out/renderer"),
    },
  },
});