import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toV1 } from "../src/supabase/messages-v0";

const here = path.dirname(fileURLToPath(import.meta.url));

// §5.2 — the API's backfill of v0 message content is a port of this module's
// toV1, checked against a shared fixture in the API repository
// (_shared/__fixtures__/messages_v0/cases.json). For each v0 shape it records
// what the backfill writes (`expected`) and, where this module returns
// something else, what it returns (`ui`). This test keeps that record honest:
// if toV1 changes here, the fixture — and the backfill's comparison — must be
// updated with it.
//
// Runs where the API repository is checked out beside this one (locally, and
// in CI's types-sync job); skipped otherwise.

const api = [
  process.env.API_REPO_DIR,
  path.resolve(here, "../../backend"),
  path.resolve(here, "../../open-bsp-api"),
]
  .filter(Boolean)
  .map((dir) =>
    path.join(
      dir,
      "supabase/functions/_shared/__fixtures__/messages_v0/cases.json",
    ),
  )
  .find((file) => existsSync(file));

describe.skipIf(!api)("§5.2: toV1 against the API's v0 fixture", () => {
  const cases = api ? JSON.parse(readFileSync(api, "utf8")) : {};

  it.each(Object.entries(cases))("%s", (_name, { input, expected, ui }) => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const result = toV1({ id: "fixture", content: input });
      expect(JSON.parse(JSON.stringify(result?.content ?? null))).toEqual(
        ui !== undefined ? ui : expected,
      );
    } finally {
      console.warn = warn;
    }
  });
});
