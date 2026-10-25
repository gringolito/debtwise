import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // The local dev loop runs the API host-native; in the images Caddy proxies /api instead.
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    // Dates are shown in the browser's time zone, so tests pin one.
    env: { TZ: "UTC" },
    setupFiles: "./src/setupTests.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      // Generated and third-party code carries no test value.
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/components/ui/**",
        "src/lib/api/generated/**",
        "src/setupTests.ts",
        "src/main.tsx",
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
