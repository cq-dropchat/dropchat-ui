import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// F29 — the UI mirrors the API's hand-written types and db_types.ts by hand.
// check-type-sync.sh only printed diffs and always exited 0, and nothing ran
// it: a field added in the API and not in the UI drifted silently. `--strict`
// fails on any difference that is not in the committed baseline of accepted
// divergences, and on db_types.ts differing at all.

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, "check-type-sync.sh");

let root;

function file(rel, content) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function run(...args) {
  const result = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      UI_TYPES_DIR: path.join(root, "ui/types"),
      UI_DB_TYPES: path.join(root, "ui/db_types.ts"),
      API_TYPES_DIR: path.join(root, "api/types"),
      API_DB_TYPES: path.join(root, "api/db_types.ts"),
      TYPE_SYNC_BASELINE: path.join(root, "baseline.txt"),
    },
  });
  return { code: result.status, out: result.stdout + result.stderr };
}

const MESSAGE = `export type TextPart = {\n  type: "text";\n  text: string;\n};\n`;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "type-sync-"));
  file("api/types/message_types.ts", MESSAGE);
  file("ui/types/message_types.ts", MESSAGE);
  file("api/db_types.ts", "export type Json = string;\n");
  file("ui/db_types.ts", "export type Json = string;\n");
  file("baseline.txt", "");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("F29: check-type-sync.sh --strict", () => {
  it("passes when the mirrors match", () => {
    expect(run("--strict")).toMatchObject({ code: 0 });
  });

  it("fails when the API gains a field the UI does not have", () => {
    file(
      "api/types/message_types.ts",
      MESSAGE.replace("text: string;", "text: string;\n  lang?: string;"),
    );

    const result = run("--strict");
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("message_types");
    expect(result.out).toContain("lang?: string;");
  });

  it("an accepted divergence is recorded with --update-baseline and then passes", () => {
    file(
      "ui/types/message_types.ts",
      MESSAGE.replace("text: string;", "text: string; // @ui-divergence: x"),
    );
    file(
      "api/types/message_types.ts",
      MESSAGE.replace("text: string;", "text: string;\n  lang?: string;"),
    );

    expect(run("--strict").code).not.toBe(0);
    expect(run("--update-baseline").code).toBe(0);
    expect(run("--strict").code).toBe(0);
  });

  it("fails when db_types.ts differs at all", () => {
    file("api/db_types.ts", "export type Json = string | number;\n");

    const result = run("--strict");
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("db_types.ts");
  });

  it("fails when the API types cannot be found", () => {
    rmSync(path.join(root, "api"), { recursive: true });

    expect(run("--strict").code).not.toBe(0);
  });

  it("without --strict it still only reports", () => {
    file("api/types/message_types.ts", MESSAGE + "export type X = 1;\n");

    expect(run().code).toBe(0);
  });

  it("the real mirrors match the committed baseline", () => {
    const repo = path.resolve(here, "..");
    const api = [
      process.env.API_REPO_DIR,
      path.resolve(repo, "../backend"),
      path.resolve(repo, "../open-bsp-api"),
    ].find(
      (dir) =>
        !!dir && existsSync(path.join(dir, "supabase/functions/_shared/types")),
    );
    if (!api) return; // the API repo is not checked out beside this one

    const result = spawnSync("bash", [SCRIPT, "--strict"], {
      encoding: "utf8",
      env: { ...process.env, API_REPO_DIR: api },
    });
    expect(result.stdout + result.stderr).toContain("types in sync");
    expect(result.status).toBe(0);
  });
});
