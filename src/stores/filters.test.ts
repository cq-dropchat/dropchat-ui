import { describe, expect, it } from "vitest";
import { Filters, filters, isArchived } from "./uiSlice";
import { conversationRow, messageRow } from "@/test/factories";

// P6: ChatList runs these for every conversation on every render. The
// answers are pinned here because the cost fix inside isArchived (an early
// exit when there is no archived mark) must not move any of them.

const msg = (timestamp: string) => messageRow({ timestamp });

describe("isArchived", () => {
  it("is false without an archived mark, whatever the message says", () => {
    expect(isArchived(undefined, msg("2026-09-01T10:00:00.000Z"))).toBe(false);
    expect(isArchived({}, msg("2026-09-01T10:00:00.000Z"))).toBe(false);
    expect(
      isArchived({ archived: null }, msg("2020-01-01T00:00:00.000Z")),
    ).toBe(false);
    expect(isArchived(undefined, undefined)).toBe(false);
  });

  // The only case the early exit answers differently than the arithmetic it
  // replaces: with no mark, the old code compared the epoch against the
  // message and called anything older than 1970 archived. Messages predate
  // nothing here — every row is stamped by an ingest or by the database —
  // and "no mark" reads as "not archived", which is what it means.
  it("is false for a message from before 1970 with no archived mark", () => {
    expect(isArchived(undefined, msg("1969-07-20T20:17:00.000Z"))).toBe(false);
  });

  it("compares the mark against the newest message", () => {
    const archived = { archived: "2026-09-01T12:00:00.000Z" };
    expect(isArchived(archived, msg("2026-09-01T10:00:00.000Z"))).toBe(true);
    expect(isArchived(archived, msg("2026-09-01T13:00:00.000Z"))).toBe(false);
    // A message arriving exactly at the mark does not un-archive it.
    expect(isArchived(archived, msg("2026-09-01T12:00:00.000Z"))).toBe(false);
  });

  it("is archived with a mark and no message at all", () => {
    expect(isArchived({ archived: "2026-09-01T12:00:00.000Z" })).toBe(true);
  });
});

describe("the list filters", () => {
  const conv = conversationRow();

  it("todas keeps everything that is not archived", () => {
    const m = msg("2026-09-01T10:00:00.000Z");
    expect(filters[Filters.ALL](conv, m, undefined, null)).toBe(true);
    expect(
      filters[Filters.ALL](
        conv,
        m,
        { archived: "2026-09-02T00:00:00.000Z" },
        null,
      ),
    ).toBe(false);
  });

  it("archivadas is its complement", () => {
    const m = msg("2026-09-01T10:00:00.000Z");
    expect(filters[Filters.ARCHIVED](conv, m, undefined, null)).toBe(false);
    expect(
      filters[Filters.ARCHIVED](
        conv,
        m,
        { archived: "2026-09-02T00:00:00.000Z" },
        null,
      ),
    ).toBe(true);
  });
});
