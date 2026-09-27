import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Local Phase-0 prototype: client-only SPA, no server, no external APIs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
