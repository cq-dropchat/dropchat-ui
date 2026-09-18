import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// F29 — check-type-sync.sh compares this output against the committed
// baseline byte for byte, so it has to be the same text on every machine.
// The system's diff is not: BSD diff (macOS) and GNU diff (the CI runner)
// choose different, equally minimal edit scripts, disagreed on five of the
// eight mirrored files, and kept the gate red on CI from the day it landed.
// These cases pin the format and — the case that mattered — the tie-break.

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, "diff-normalized.mjs");

let root;

function diff(a, b) {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "a.ts"), a);
  writeFileSync(path.join(root, "b.ts"), b);
  const result = spawnSync(
    "node",
    [SCRIPT, path.join(root, "a.ts"), path.join(root, "b.ts")],
    { encoding: "utf8" },
  );
  return { code: result.status, out: result.stdout };
}

const A = `export type A = {\n  one: string;\n};\n`;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "diff-normalized-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("F29: the declarations diff", () => {
  it("says nothing, and exits 0, when the declarations match", () => {
    const withComments = `// a comment the diff must not see\n${A}`;
    expect(diff(A, withComments)).toEqual({ code: 0, out: "" });
  });

  it("exits 1 and names the line that only the first file has", () => {
    const b = `export type A = {\n  one: string;\n  two: number;\n};\n`;
    const result = diff(b, A);
    expect(result.code).toBe(1);
    expect(result.out).toBe("3d2\n<     two: number;\n");
  });

  it("names the line that only the second file has", () => {
    const b = `export type A = {\n  one: string;\n  two: number;\n};\n`;
    expect(diff(A, b).out).toBe("2a3\n>     two: number;\n");
  });

  it("a changed line is a change, not a deletion and an addition", () => {
    const b = `export type A = {\n  one: number;\n};\n`;
    expect(diff(A, b).out).toBe(
      "2c2\n<     one: string;\n---\n>     one: number;\n",
    );
  });

  // The shape that made BSD and GNU disagree: several identical lines (the
  // closing braces of consecutive declarations) mean more than one minimal
  // edit script exists, and each implementation picked a different one. What
  // matters is not which is chosen but that the choice never moves.
  it("picks one answer where several minimal ones exist, and keeps picking it", () => {
    const a =
      `export type A = {\n  one: string;\n};\n` +
      `export type B = {\n  two: string;\n};\n` +
      `export type C = {\n  three: string;\n};\n`;
    const b = `export type A = {\n  one: string;\n};\n`;

    const first = diff(a, b);
    expect(first.code).toBe(1);
    expect(first.out).toBe(
      [
        "4,9d3",
        "< export type B = {",
        "<     two: string;",
        "< };",
        "< export type C = {",
        "<     three: string;",
        "< };",
        "",
      ].join("\n"),
    );

    // Same inputs, same text — the property the baseline depends on.
    expect(diff(a, b).out).toBe(first.out);
  });

  it("reports several regions of the same file in order", () => {
    const a = `export type A = {\n  one: string;\n  two: string;\n};\n`;
    const b = `export type A = {\n  zero: string;\n  one: string;\n};\n`;
    expect(diff(a, b).out).toBe(
      ["1a2", ">     zero: string;", "3d3", "<     two: string;", ""].join(
        "\n",
      ),
    );
  });
});
