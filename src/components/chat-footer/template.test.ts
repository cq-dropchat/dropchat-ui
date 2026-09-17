import { describe, expect, it } from "vitest";
import { allVariablesFilled } from "./template";

// Found by F29's characterization of ChatFooter: the send button of a
// template was enabled before any variable was typed. The check ran `every`
// over the typed values sliced to the variable count — and a slice of an
// empty list is empty, so it passed, and the message was stored with its
// placeholders unfilled and without the parameters the template declares.

describe("allVariablesFilled", () => {
  const counts = { bodyVarCount: 2, headVarCount: 1 };

  it("is false before any variable is typed", () => {
    expect(allVariablesFilled(counts, [], [])).toBe(false);
  });

  it("is false while one is missing or blank", () => {
    expect(allVariablesFilled(counts, ["Ana"], ["#1"])).toBe(false);
    expect(allVariablesFilled(counts, ["Ana", "  "], ["#1"])).toBe(false);
    expect(allVariablesFilled(counts, ["Ana", "lunes"], [])).toBe(false);
  });

  it("is true when every variable has a value", () => {
    expect(allVariablesFilled(counts, ["Ana", "lunes"], ["#1"])).toBe(true);
  });

  it("is true for a template without variables", () => {
    expect(
      allVariablesFilled({ bodyVarCount: 0, headVarCount: 0 }, [], []),
    ).toBe(true);
  });
});
