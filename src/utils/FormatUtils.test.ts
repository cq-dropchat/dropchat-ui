// F22: FormatUtils moves from libphonenumber-js's default build (full
// metadata, ~30 KB gzip in the first screen) to `libphonenumber-js/min`.
// These pin the outputs the UI shows today (captured with the full build),
// quirks included, for the numbers it sees:
// WhatsApp wa_ids (digits, no plus) from several countries, user-typed
// numbers in the "new conversation" and WhatsApp Web forms, and garbage.
import { describe, expect, it } from "vitest";
import {
  formatPhoneNumber,
  isValidPhoneNumber,
  nameInitials,
  normalizePhoneNumber,
} from "./FormatUtils";

describe("formatPhoneNumber", () => {
  it.each([
    ["5491155551234", "+54 9 11 5555 1234"],
    ["34612345678", "+34 612 34 56 78"],
    ["5215512345678", "+52 15512345678"],
    ["14155552671", "+1 415 555 2671"],
    ["447911123456", "+44 7911 123456"],
    ["5511987654321", "+55 11 98765 4321"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatPhoneNumber(input)).toBe(expected);
  });

  it("returns what it cannot parse unchanged", () => {
    expect(formatPhoneNumber("not-a-number")).toBe("not-a-number");
    // An Instagram-scoped id is not a phone number, but it parses as +1.
    expect(formatPhoneNumber("17840000000000001")).toBe("+1 7840000000000001");
  });
});

describe("isValidPhoneNumber", () => {
  it.each([
    ["+54 9 11 5555-1234", true],
    ["+34 612 34 56 78", true],
    ["+1 415 555 2671", true],
    ["", true], // empty is allowed: the field is optional
    ["+54 1", false],
    ["hello", false],
    ["+999 123", false],
  ])("%s → %s", (input, expected) => {
    expect(isValidPhoneNumber(input)).toBe(expected);
  });
});

describe("normalizePhoneNumber", () => {
  it.each([
    ["+54 11 5555-1234", "5491155551234"], // Argentina mobile gets its 9
    ["+54 9 11 5555-1234", "5491155551234"],
    ["+34 612 34 56 78", "34612345678"],
    ["+1 (415) 555-2671", "14155552671"],
    ["abc 123", "123"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });
});

describe("nameInitials", () => {
  it("takes two initials or the first two letters", () => {
    expect(nameInitials("Carla Gómez Ruiz")).toBe("CG");
    expect(nameInitials("Dario")).toBe("Da");
  });
});
