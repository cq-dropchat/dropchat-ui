// H6 — a weekly schedule that says something impossible is not a cosmetic
// problem: H4's sweeps read it to decide when a customer's wait is late.
import { describe, expect, it } from "vitest";
import {
  dayError,
  fromForm,
  scheduleErrors,
  toForm,
  toMinutes,
} from "./businessHours";

describe("H6: the business-hours editor's rules", () => {
  it("accepts a plain working day, and a day with a break", () => {
    expect(dayError([["09:00", "19:00"]])).toBeUndefined();
    expect(
      dayError([
        ["09:00", "13:00"],
        ["15:00", "19:00"],
      ]),
    ).toBeUndefined();
    expect(dayError([])).toBeUndefined();
  });

  it("refuses a window that closes before it opens", () => {
    expect(dayError([["19:00", "09:00"]])).toBe("order");
    expect(dayError([["09:00", "09:00"]])).toBe("order");
  });

  it("refuses two windows over the same hour, in any order", () => {
    expect(
      dayError([
        ["09:00", "14:00"],
        ["13:00", "19:00"],
      ]),
    ).toBe("overlap");
    expect(
      dayError([
        ["13:00", "19:00"],
        ["09:00", "14:00"],
      ]),
    ).toBe("overlap");
  });

  it("refuses a time that is not a time", () => {
    expect(dayError([["9", "19:00"]])).toBe("invalid");
    expect(dayError([["09:60", "19:00"]])).toBe("invalid");
    expect(dayError([["25:00", "26:00"]])).toBe("invalid");
    // 24:00 is how a schedule says "until midnight".
    expect(dayError([["09:00", "24:00"]])).toBeUndefined();
  });

  it("reports the days that are wrong and leaves the rest alone", () => {
    const errors = scheduleErrors({
      mon: [["09:00", "19:00"]],
      tue: [["19:00", "09:00"]],
      wed: [],
    });

    expect(errors).toEqual({ tue: "order" });
  });

  it("round-trips a schedule, and saves a week of closed days as no schedule", () => {
    const form = toForm({ mon: [["09:00", "19:00"]] });

    expect(form.mon).toEqual([["09:00", "19:00"]]);
    expect(form.sun).toEqual([]);

    expect(fromForm(form)?.mon).toEqual([["09:00", "19:00"]]);
    // Nothing configured anywhere means 24/7, which is `null` (H4).
    expect(fromForm(toForm(null))).toBeNull();
  });

  it("saves each day's windows in order", () => {
    const saved = fromForm({
      mon: [
        ["15:00", "19:00"],
        ["09:00", "13:00"],
      ],
    });

    expect(saved?.mon).toEqual([
      ["09:00", "13:00"],
      ["15:00", "19:00"],
    ]);
  });

  it("reads a time in minutes", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("24:00")).toBe(1440);
  });
});
