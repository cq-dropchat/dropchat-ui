import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Standalone config (not merged with vite.config.ts): the router plugin and
// the React Compiler are build concerns and only slow the test transform.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    env: {
      // The Supabase client is built at import time; these are obviously
      // fake and only satisfy the constructor. Tests never hit the network:
      // PostgREST is mocked with msw where a query is exercised.
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/supabase/db_types.ts",
        "src/routeTree.gen.ts",
        "src/supabase/types/**", // type-only modules
        "src/deprecated/**",
        "src/main.tsx",
        "src/dev/**", // dev-only harnesses, never in the build
      ],
      // CI gate. Ratcheted at the end of each phase to (reached − 2), never
      // lowered. See IMPLEMENTATION_STATUS.md.
      thresholds: {
        // Ratchet (end of phase 3): reached − 2, rounded down. Reached:
        // lines 12.4 %, branches 9.5 %; stores 60.7 % / 61.0 %. Never lowered.
        lines: 10,
        branches: 7,
        "src/stores/**/*.ts": { lines: 58, branches: 58 },
      },
    },
  },
});
