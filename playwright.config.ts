import { defineConfig, devices } from "@playwright/test";

// One end-to-end flow against a LOCAL Supabase (`supabase start` in the API
// repo, which applies seed.sql: goat@craft.com / goat) and `vite preview`.
//
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 \
//   VITE_SUPABASE_ANON_KEY=<anon key from `supabase status`> \
//   npm run e2e
//
// The build reads the VITE_* variables at bundle time, so they must be in the
// environment of the `webServer` command below (inherited from the shell).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
