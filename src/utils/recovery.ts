/**
 * F13. Catching up after the tab was hidden.
 *
 * The old recovery asked for `updated_at > lastVisibleAt … limit 999`,
 * newest first: past 999 changes it silently kept the newest and dropped
 * the rest, and nothing ever asked for the gap again. This walks the changes
 * oldest first with a keyset cursor (updated_at, id) — ties on updated_at
 * are common, a plain `updated_at >` would skip rows at a page boundary —
 * until a page comes back short.
 */

export type Cursor = { updated_at: string; id: string };

/** PostgREST's default max-rows. */
export const RECOVERY_PAGE_SIZE = 1000;

/**
 * Past this absence, paging through every change costs more than reloading
 * the window init_data serves; the caller refetches instead.
 */
export const RECOVERY_FULL_RELOAD_AFTER_MS = 6 * 60 * 60 * 1000;

export function shouldReloadInsteadOfCatchUp(
  lastVisibleAt: Date,
  now: number = Date.now(),
): boolean {
  return now - lastVisibleAt.getTime() > RECOVERY_FULL_RELOAD_AFTER_MS;
}

/** The `or` filter for rows strictly after the cursor, in PostgREST syntax. */
export function afterCursorFilter(cursor: Cursor): string {
  // Quoted values: timestamps contain ':' and '+', which PostgREST's filter
  // grammar would otherwise read as syntax.
  return `updated_at.gt."${cursor.updated_at}",and(updated_at.eq."${cursor.updated_at}",id.gt."${cursor.id}")`;
}

export async function collectChangesSince<T extends Cursor>(
  since: string,
  fetchPage: (cursor: Cursor) => Promise<T[]>,
  onPage: (rows: T[]) => void,
  pageSize: number = RECOVERY_PAGE_SIZE,
): Promise<number> {
  // The smallest uuid: every row at `since` itself is strictly after it only
  // by id, and `since` was the moment the tab was hidden, so those rows were
  // already seen — but re-pushing them is harmless (the store keeps the
  // newer copy), while skipping one is not.
  let cursor: Cursor = {
    updated_at: since,
    id: "00000000-0000-0000-0000-000000000000",
  };
  let total = 0;

  for (;;) {
    const page = await fetchPage(cursor);
    if (page.length > 0) {
      onPage(page);
      total += page.length;
      const last = page[page.length - 1];
      cursor = { updated_at: last.updated_at, id: last.id };
    }
    if (page.length < pageSize) return total;
  }
}
