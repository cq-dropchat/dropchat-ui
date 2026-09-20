// Missing and stale translation keys, compared against the source.
//
//   node scripts/sync-translations.mjs
//
// Exits 1 when a locale and the code disagree, 0 when they match.
//
// This was a shell script until it turned out nobody could run it: `grep -P`
// does not exist on macOS, so the check only ever ran on a machine nobody
// used it on, and its two lists had drifted into noise — a line-based grep
// cannot see a `t(` whose string prettier moved to the next line, and
// `t("…")` as a pattern also matches `import("…")`, `it("…")` and
// `.select("…")`. Same problem, and same answer, as diff-normalized.mjs: do
// it in the one runtime this repository already requires, and test it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const LOCALES = ["en", "pt", "sw", "fr"];

/**
 * A call to the translator, wherever the formatter put its string:
 * `t(` preceded by something that is not part of a longer name (so `import(`,
 * `it(`, `.select(` and `i18n.t(` are not calls to it), then any whitespace,
 * then one double-quoted string. A template literal has no fixed key, so it
 * is not one.
 */
const CALL = /(^|[^A-Za-z0-9_$.])t\(\s*"((?:[^"\\]|\\.)*)"/g;

/** The key as JavaScript reads it: `\"` is a quote, not two characters. */
function unescape(literal) {
  try {
    return JSON.parse(`"${literal}"`);
  } catch {
    // A JS-only escape (`\'`), which JSON does not accept. The key is then
    // whatever the source says, which is what the locale files hold too.
    return literal;
  }
}

/** Every distinct key a source file asks for, in the order it asks. */
export function keysInSource(source) {
  const keys = new Set();

  for (const [, , literal] of source.matchAll(CALL)) {
    keys.add(unescape(literal));
  }

  return [...keys];
}

/** What the code needs and the locale does not have, and the other way round. */
export function compare(codeKeys, localeKeys) {
  const code = new Set(codeKeys);
  const locale = new Set(localeKeys);

  return {
    missing: [...code].filter((key) => !locale.has(key)).sort(),
    stale: [...locale].filter((key) => !code.has(key)).sort(),
  };
}

/**
 * Keys that are not prose: format strings for the date library, an example
 * model name, the placeholder of a field. A locale may want its own — `dddd`
 * is a different word order elsewhere — so they go through `t()`, but whether
 * one is present or absent is nobody's drift. Ignored on both sides: filtering
 * them out of the code alone would report the ones a locale does carry as
 * unused, which is how this list started.
 */
const NOT_TEXT = new Set([
  "dddd",
  "HH:mm",
  "l",
  "m:ss",
  "gpt-5-mini",
  "nombre_de_plantilla",
  "usuario@ejemplo.com",
  "+54 9 11 1234 5678",
  "https://ejemplo.com/webhook",
]);

function sourceFiles(dir) {
  const out = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }

  return out;
}

function report(name, label, keys) {
  if (keys.length === 0) return false;

  console.log(`${label} ${name}.json (${keys.length} keys):`);
  for (const key of keys) console.log(`  ${key}`);
  console.log();

  return true;
}

function main() {
  const code = new Set();

  for (const file of sourceFiles(path.join(ROOT, "src"))) {
    for (const key of keysInSource(readFileSync(file, "utf8"))) {
      if (key !== "" && !NOT_TEXT.has(key)) code.add(key);
    }
  }

  let drift = false;

  for (const name of LOCALES) {
    const file = path.join(ROOT, "public", "locales", `${name}.json`);
    const keys = Object.keys(JSON.parse(readFileSync(file, "utf8"))).filter(
      (key) => !NOT_TEXT.has(key),
    );
    const { missing, stale } = compare([...code], keys);

    drift = report(name, "❌ Missing from", missing) || drift;
    drift = report(name, "⚠️  Stale in", stale) || drift;
  }

  if (!drift) {
    console.log(
      `✅ All translation keys are in sync (${code.size} code keys, ${LOCALES.join(", ")})`,
    );
  }

  process.exit(drift ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
