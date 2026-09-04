import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@mota/contracts/transit-map",
        replacement: resolve(
          currentDirectory,
          "../../packages/contracts/src/transitMap.ts",
        ),
      },
      {
        find: "@mota/contracts/transit-settings",
        replacement: resolve(
          currentDirectory,
          "../../packages/contracts/src/transitSettings.ts",
        ),
      },
      {
        find: "@mota/contracts",
        replacement: resolve(
          currentDirectory,
          "../../packages/contracts/src",
        ),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  build: {
    target: "es2022",
  },
});
