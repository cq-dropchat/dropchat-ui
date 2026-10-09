import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const localUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(localUrl))
  throw new Error("E2E only runs against the disposable local stack");
process.env.VITE_SUPABASE_URL = localUrl;
if (!process.env.VITE_SUPABASE_ANON_KEY) {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      cwd: path.resolve(process.env.API_REPO_DIR || "../api"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  process.env.VITE_SUPABASE_ANON_KEY = status.ANON_KEY;
}

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
  // The seeded actors and org attention policy are shared. Repeats must not
  // revoke another browser's session or overwrite its fixture policy.
  workers: 1,
  retries: 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    // The UI has no language setting on the login screen: it reads
    // `navigator.languages` and falls back to English for anything it does not
    // recognise (`detectDefaultLanguage`, stores/uiSlice.ts). So the browser's
    // locale decides whether the submit button reads "Entrar" or "Log in",
    // and this spec looks for the Spanish one. On a developer's machine it
    // passed by accident; on a CI runner Chromium is en-US and the click timed
    // out after 60 s waiting for a button that was never going to appear —
    // while the two `fill`s above kept working, because placeholders are not
    // translated. Pinning it also states the intent: the flow is checked in
    // the product's own language.
    locale: "es-CL",
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
