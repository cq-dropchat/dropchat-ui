// F22 — load budget, checked against `dist/` after `vite build`.
//
// Two sets, walked from dist/.vite/manifest.json through static imports:
//   initial       index.html's entry and everything it statically imports
//                 (what <link rel="modulepreload"> fetches before React
//                 mounts)
//   first screen  initial + the `_auth` layout + the /conversations list,
//                 which every signed-in visit renders
//
// Audit baseline: `_auth` alone was 179 KB gzip with recharts (only /stats
// uses it) and turndown/he (only the message composer), and FormatUtils
// shipped libphonenumber-js with full metadata.
//
// Usage: node scripts/check-bundle.mjs [--report]
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "../dist");

// Budgets in KB gzip: measured after F22 (157.5 / 322.7) plus ~5 %.
// Lower them as the bundle shrinks; never raise them.
const BUDGET = {
  initialKB: 165,
  firstScreenKB: 340,
  firstScreenEntries: [
    "src/routes/_auth.tsx?tsr-split=component",
    "src/routes/_auth/conversations/index.tsx?tsr-split=component",
  ],
  // Never in the first screen.
  forbidden: {
    recharts: /recharts/,
    turndown: /turndown/,
    he: /node_modules\/he\//,
    "libphonenumber-js (max/mobile metadata)":
      /libphonenumber-js\/metadata\.(max|full|mobile)/,
  },
};

function closure(manifest, keys) {
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    for (const dep of manifest[key].imports ?? []) visit(dep);
  };
  keys.forEach(visit);
  return seen;
}

/** Which forbidden libraries went into a chunk, from its manifest sources. */
function libraries(manifest, chunkKeys, sourcesByFile) {
  const files = new Set([...chunkKeys].map((k) => manifest[k].file));
  const found = new Map();
  for (const [name, re] of Object.entries(BUDGET.forbidden)) {
    for (const file of files) {
      if ((sourcesByFile.get(file) ?? []).some((s) => re.test(s))) {
        found.set(name, file);
      }
    }
  }
  return found;
}

/**
 * Module ids per output file. Vite's manifest lists chunks, not the modules
 * inside them, so the build writes them with `sources` (see vite.config.ts).
 */
function readSources() {
  const file = path.join(DIST, ".vite/chunk-modules.json");
  if (!existsSync(file)) return new Map();
  return new Map(Object.entries(JSON.parse(readFileSync(file, "utf8"))));
}

function gzipKB(file) {
  return gzipSync(readFileSync(path.join(DIST, file))).length / 1024;
}

function measure(manifest, keys) {
  const files = [...keys].map((k) => manifest[k].file);
  return {
    files,
    kb: files.reduce((sum, f) => sum + gzipKB(f), 0),
  };
}

function main() {
  const manifestFile = path.join(DIST, ".vite/manifest.json");
  if (!existsSync(manifestFile)) {
    console.error("dist/.vite/manifest.json not found: run `vite build` first");
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const sources = readSources();
  const failures = [];

  for (const key of BUDGET.firstScreenEntries) {
    if (!manifest[key]) failures.push(`manifest has no entry ${key}`);
  }

  const initialKeys = closure(manifest, ["index.html"]);
  const firstKeys = closure(manifest, [
    "index.html",
    ...BUDGET.firstScreenEntries,
  ]);
  const initial = measure(manifest, initialKeys);
  const first = measure(manifest, firstKeys);

  if (process.argv.includes("--report")) {
    const rows = first.files
      .map((f) => ({ f, kb: gzipKB(f) }))
      .sort((a, b) => b.kb - a.kb);
    for (const { f, kb } of rows) {
      console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`);
    }
  }

  console.log(
    `initial:      ${initial.kb.toFixed(1)} KB gzip in ${initial.files.length} files (budget ${BUDGET.initialKB})`,
  );
  console.log(
    `first screen: ${first.kb.toFixed(1)} KB gzip in ${first.files.length} files (budget ${BUDGET.firstScreenKB})`,
  );

  if (initial.kb > BUDGET.initialKB) {
    failures.push(
      `initial ${initial.kb.toFixed(1)} KB > ${BUDGET.initialKB} KB`,
    );
  }
  if (first.kb > BUDGET.firstScreenKB) {
    failures.push(
      `first screen ${first.kb.toFixed(1)} KB > ${BUDGET.firstScreenKB} KB`,
    );
  }
  if (sources.size === 0) {
    failures.push(
      "dist/.vite/chunk-modules.json missing: library check skipped",
    );
  }
  for (const [name, file] of libraries(manifest, firstKeys, sources)) {
    failures.push(`${name} in first-screen chunk ${file}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log("bundle budget OK");
}

main();
