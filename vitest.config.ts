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
        // Ratchet (end of phase 5): reached − 2, rounded down. Reached:
        // lines 31.07 %, branches 27.41 %; stores 81.62 % / 75.21 %. Never
        // lowered. (Phase 4: 26 / 22; stores 75 / 70. Phase 3: 10 / 7.)
        lines: 29,
        branches: 25,
        "src/stores/**/*.ts": { lines: 79, branches: 73 },
      },
    },
  },
});
