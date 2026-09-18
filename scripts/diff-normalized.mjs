// F29: the declarations-only difference between two TypeScript files, in
// diff's normal format, computed here instead of by the system's diff.
//
// check-type-sync.sh compares this text against scripts/type-sync.baseline
// byte for byte, so the text has to be the same everywhere. It was not: BSD
// diff (macOS) and GNU diff (the CI runner) pick different — both minimal —
// edit scripts, and disagreed on five of the eight mirrored files, in the
// `<`/`>` lines and not just in the hunk headers. The gate could therefore
// never be green on both, and in practice was red on CI from the day it
// landed.
//
// The edit script below is the one an LCS built by the usual dynamic program
// yields, with the tie broken the same way every time (on a tie, prefer the
// deletion), which makes the output a function of the two files alone.
//
//   node scripts/diff-normalized.mjs <api.ts> <ui.ts>
//
// Exits 0 when the declarations match and 1 when they differ, like diff.
import { normalize } from "./normalize-types.mjs";

/** Lines of a printed file, without the empty last element. */
function lines(text) {
  const out = text.split("\n");
  if (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * The edit script as a list of {op, a, b} where op is "=", "-" (only in A) or
 * "+" (only in B), and a/b are indexes into each side.
 */
function editScript(a, b) {
  // lcs[i][j] = length of the longest common subsequence of a[i…] and b[j…].
  const width = b.length + 1;
  const lcs = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const script = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      script.push({ op: "=", a: i++, b: j++ });
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      // The tie-break. Deleting first is what keeps this deterministic.
      script.push({ op: "-", a: i++, b: j });
    } else {
      script.push({ op: "+", a: i, b: j++ });
    }
  }
  while (i < a.length) script.push({ op: "-", a: i++, b: j });
  while (j < b.length) script.push({ op: "+", a: i, b: j++ });
  return script;
}

/** `n` for a one-line range, `n,m` for a longer one — diff's own spelling. */
function range(start, end) {
  return start === end ? `${start}` : `${start},${end}`;
}

function normalFormat(a, b) {
  const script = editScript(a, b);
  const out = [];

  for (let k = 0; k < script.length; ) {
    if (script[k].op === "=") {
      k++;
      continue;
    }

    const start = k;
    while (k < script.length && script[k].op === "-") k++;
    const dels = script.slice(start, k);
    const addStart = k;
    while (k < script.length && script[k].op === "+") k++;
    const adds = script.slice(addStart, k);

    // Line numbers are 1-based; a pure insertion names the line it follows,
    // and a pure deletion the line on the other side it follows.
    const aFrom = (dels.length ? dels[0].a : script[start].a) + 1;
    const aTo = dels.length ? dels[dels.length - 1].a + 1 : aFrom - 1;
    const bFrom = (adds.length ? adds[0].b : script[start].b) + 1;
    const bTo = adds.length ? adds[adds.length - 1].b + 1 : bFrom - 1;

    if (dels.length && adds.length) {
      out.push(`${range(aFrom, aTo)}c${range(bFrom, bTo)}`);
    } else if (dels.length) {
      out.push(`${range(aFrom, aTo)}d${bFrom - 1}`);
    } else {
      out.push(`${aFrom - 1}a${range(bFrom, bTo)}`);
    }

    for (const d of dels) out.push(`< ${a[d.a]}`);
    if (dels.length && adds.length) out.push("---");
    for (const s of adds) out.push(`> ${b[s.b]}`);
  }

  return out;
}

const [apiFile, uiFile] = process.argv.slice(2);
const out = normalFormat(lines(normalize(apiFile)), lines(normalize(uiFile)));
if (out.length) {
  process.stdout.write(out.join("\n") + "\n");
  process.exit(1);
}
