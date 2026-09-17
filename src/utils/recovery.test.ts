import { describe, expect, it, vi } from "vitest";
import {
  collectChangesSince,
  RECOVERY_FULL_RELOAD_AFTER_MS,
  shouldReloadInsteadOfCatchUp,
  type Cursor,
} from "./recovery";

type Row = { id: string; updated_at: string };

// 1,500 rows changed while the tab was hidden, several sharing a timestamp.
function changes(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `row-${String(i).padStart(5, "0")}`,
    updated_at: new Date(
      Date.parse("2026-09-17T10:00:00.000Z") + Math.floor(i / 3) * 1000,
    ).toISOString(),
  }));
}

/** A PostgREST-like page source: rows after the cursor, ascending, limited. */
function source(rows: Row[], limit: number) {
  return vi.fn((cursor: Cursor) =>
    Promise.resolve(
      rows
        .filter(
          (r) =>
            r.updated_at > cursor.updated_at ||
            (r.updated_at === cursor.updated_at && r.id > cursor.id),
        )
        .sort((a, b) =>
          a.updated_at === b.updated_at
            ? a.id.localeCompare(b.id)
            : a.updated_at.localeCompare(b.updated_at),
        )
        .slice(0, limit),
    ),
  );
}

describe("F13: tab recovery pages through every change", () => {
  it("collects all 1,500 changes, not the 999 most recent", async () => {
    const rows = changes(1500);
    const fetchPage = source(rows, 1000);
    const seen: Row[] = [];

    await collectChangesSince(
      "2026-09-17T09:59:59.000Z",
      fetchPage,
      (page) => seen.push(...page),
      1000,
    );

    expect(seen).toHaveLength(1500);
    expect(new Set(seen.map((r) => r.id)).size).toBe(1500);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("does not lose rows that share the timestamp at a page boundary", async () => {
    const rows = changes(10); // triples of equal updated_at
    const seen: Row[] = [];

    await collectChangesSince(
      "2026-09-17T09:00:00.000Z",
      source(rows, 4),
      (page) => seen.push(...page),
      4,
    );

    expect(seen.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("stops after a short page", async () => {
    const fetchPage = source(changes(3), 1000);
    await collectChangesSince(
      "2026-09-17T09:00:00.000Z",
      fetchPage,
      () => {},
      1000,
    );
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe("F13: long absences reload instead of catching up", () => {
  it("catches up after a short absence and reloads after a long one", () => {
    const now = Date.parse("2026-09-17T12:00:00Z");
    expect(shouldReloadInsteadOfCatchUp(new Date(now - 60_000), now)).toBe(
      false,
    );
    expect(
      shouldReloadInsteadOfCatchUp(
        new Date(now - RECOVERY_FULL_RELOAD_AFTER_MS - 1),
        now,
      ),
    ).toBe(true);
  });
});
