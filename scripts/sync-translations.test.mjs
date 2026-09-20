import { describe, expect, it } from "vitest";
import { compare, keysInSource } from "./sync-translations.mjs";

// The translation gate is only useful if its two lists are right. The bash
// version it replaces got both wrong, and could not run on macOS at all
// (`grep -P`), so nobody saw it: it read the sources line by line, so every
// `t(` whose string sat on the next line — which is every long string, the
// ones most worth translating — was reported as a stale key nobody used (94
// of them), and it matched any identifier ending in `t` followed by a quoted
// argument, so `import("./Message")`, `it("sent template")` and
// `.select("id, label")` were reported as missing translations (46 of them).
// 140 lines of noise over a real drift of a dozen keys.
describe("the translation keys of a source file", () => {
  it("finds a call written on one line", () => {
    expect(keysInSource(`<p>{t("Atención")}</p>`)).toEqual(["Atención"]);
  });

  it("finds a call whose string prettier moved to its own line", () => {
    const source = `
      <p>
        {t(
          "Sin horario, la organización se considera disponible a toda hora.",
        )}
      </p>`;

    expect(keysInSource(source)).toEqual([
      "Sin horario, la organización se considera disponible a toda hora.",
    ]);
  });

  it("does not take the tail of a longer identifier for a call", () => {
    const source = [
      `const Chat = lazy(() => import("./Message"));`,
      `it("sent template", () => {});`,
      `supabase.from("conversations").select("id, label").not("deleted_at", "is", null);`,
      `expect("closed").toBe(status);`,
    ].join("\n");

    expect(keysInSource(source)).toEqual([]);
  });

  it("ignores a property or method named t", () => {
    expect(keysInSource(`i18n.t("Atención"); obj?.t("Hola");`)).toEqual([]);
  });

  it("reads the string as JavaScript wrote it", () => {
    expect(
      keysInSource(`t("Copiá la clave: dice \\"no se muestra\\".")`),
    ).toEqual(['Copiá la clave: dice "no se muestra".']);
  });

  it("leaves an interpolated string alone: it is not a key", () => {
    expect(keysInSource("t(`Hola ${name}`)")).toEqual([]);
  });

  it("reports each key once, however often it is used", () => {
    expect(keysInSource(`t("Guardar"); t("Guardar");`)).toEqual(["Guardar"]);
  });
});

describe("the comparison", () => {
  it("says which keys the locale is missing and which it no longer needs", () => {
    expect(compare(["Atención", "Guardar"], ["Guardar", "Cancelar"])).toEqual({
      missing: ["Atención"],
      stale: ["Cancelar"],
    });
  });

  it("says nothing when they agree", () => {
    expect(compare(["Guardar"], ["Guardar"])).toEqual({
      missing: [],
      stale: [],
    });
  });
});
