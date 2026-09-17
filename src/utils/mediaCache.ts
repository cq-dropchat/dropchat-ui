import { clear, createStore, del, entries, get, keys, set } from "idb-keyval";

/**
 * F21. Where media blobs live once downloaded.
 *
 * Memory: `chat.mediaLoads` in the store, capped at MEDIA_MEMORY_BUDGET. The
 * store evicts the least recently used blob (see chatSlice.setMediaLoad);
 * what counts as "used" and what must stay is tracked here, outside the
 * store, so marking a blob as used does not re-render anything.
 *
 * Disk: IndexedDB, capped at MEDIA_DISK_BUDGET. Keys start with the user id,
 * and the whole cache is emptied when the signed-in user changes or signs out
 * (uiSlice.setUser → claimMediaCache/clearMediaCache): a blob one user was allowed to download is never served
 * to another on the same browser.
 */

export const MEDIA_MEMORY_BUDGET = 50 * 1024 * 1024;
export const MEDIA_DISK_BUDGET = 200 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Memory: use and retention.
// ---------------------------------------------------------------------------

const retained = new Map<string, number>();
const lastUsed = new Map<string, number>();
let clock = 0;

/** A mounted message shows this blob: it is recent, and it stays. */
export function retainMedia(messageId: string) {
  retained.set(messageId, (retained.get(messageId) ?? 0) + 1);
  lastUsed.set(messageId, ++clock);
}

/** Returns whether the message was still retained by someone else. */
export function releaseMedia(messageId: string) {
  const count = retained.get(messageId) ?? 0;
  if (count <= 1) {
    retained.delete(messageId);
    return false;
  }
  retained.set(messageId, count - 1);
  return true;
}

export function touchMedia(messageId: string) {
  lastUsed.set(messageId, ++clock);
}

export function isMediaRetained(messageId: string) {
  return retained.has(messageId);
}

export function mediaLastUsed(messageId: string) {
  return lastUsed.get(messageId) ?? 0;
}

export function forgetMedia(messageId: string) {
  lastUsed.delete(messageId);
}

// ---------------------------------------------------------------------------
// Disk.
// ---------------------------------------------------------------------------

type IndexEntry = { size: number; usedAt: number };
type StoredBlob = { bytes: ArrayBuffer; type: string };

// Two object stores: enforcing the budget reads the small index, never the
// blobs. idb-keyval opens one store per database.
let stores:
  | {
      blobs: ReturnType<typeof createStore>;
      index: ReturnType<typeof createStore>;
    }
  | undefined;

function disk() {
  if (typeof indexedDB === "undefined") return undefined;
  stores ??= {
    blobs: createStore("dropchat-media", "blobs"),
    index: createStore("dropchat-media-index", "index"),
  };
  return stores;
}

const key = (userId: string, mediaId: string) => `${userId}:${mediaId}`;
// Blob keys are `user:media`; this one has no colon, so it cannot clash.
const OWNER_KEY = "owner";

/** Monotonic even when two writes land in the same millisecond. */
let lastStamp = 0;
function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

// Writes are serialized: two downloads finishing together must not both
// read the index, then both decide nothing needs evicting.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

export function cacheBlob(
  userId: string,
  mediaId: string,
  blob: Blob,
  budget = MEDIA_DISK_BUDGET,
): Promise<void> {
  const db = disk();
  if (!db || blob.size > budget) return Promise.resolve();

  return serialized(async () => {
    // A download that finishes after the user changed is not kept.
    if ((await get<string>(OWNER_KEY, db.blobs)) !== userId) return;

    const k = key(userId, mediaId);
    // Bytes, not the Blob: some engines (older Safari) fail to store Blobs
    // in IndexedDB, and an ArrayBuffer clones everywhere.
    const stored: StoredBlob = {
      bytes: await blob.arrayBuffer(),
      type: blob.type,
    };
    await set(k, stored, db.blobs);
    await set(k, { size: blob.size, usedAt: stamp() }, db.index);

    const index = await entries<string, IndexEntry>(db.index);
    let total = index.reduce((sum, [, entry]) => sum + entry.size, 0);
    index.sort((a, b) => a[1].usedAt - b[1].usedAt);

    for (const [oldKey, entry] of index) {
      if (total <= budget) break;
      if (oldKey === k) continue;
      await del(oldKey, db.index);
      await del(oldKey, db.blobs);
      total -= entry.size;
    }
  });
}

export async function readCachedBlob(
  userId: string,
  mediaId: string,
): Promise<Blob | undefined> {
  const db = disk();
  if (!db) return undefined;

  const k = key(userId, mediaId);
  const stored = await get<StoredBlob>(k, db.blobs);
  if (!stored) return undefined;

  await serialized(async () => {
    const entry = await get<IndexEntry>(k, db.index);
    if (entry) await set(k, { ...entry, usedAt: stamp() }, db.index);
  });
  return new Blob([stored.bytes], { type: stored.type });
}

/**
 * The signed-in user takes the cache: if it held another user's blobs (a
 * session that expired without signing out), it is emptied first. The same
 * user after a reload keeps it.
 */
export function claimMediaCache(userId: string): Promise<void> {
  const db = disk();
  if (!db) return Promise.resolve();

  return serialized(async () => {
    if ((await get<string>(OWNER_KEY, db.blobs)) === userId) return;
    await clear(db.index);
    await clear(db.blobs);
    await set(OWNER_KEY, userId, db.blobs);
  });
}

/**
 * P8: forget one blob. Called when the object is gone or refused (404/403) —
 * F18 deletes an account's attachments, and access can be revoked between two
 * downloads — so the next read goes back to the server instead of serving
 * something the server would no longer hand over.
 *
 * It only reaches what a download reached: a cached blob is served without
 * asking, so the entry that is hit every time is the one this never sees.
 * Losing the organization is what dropOrganizationMedia is for.
 */
export function forgetCachedBlob(
  userId: string,
  mediaId: string,
): Promise<void> {
  const db = disk();
  if (!db) return Promise.resolve();

  const k = key(userId, mediaId);
  return serialized(async () => {
    await del(k, db.index);
    await del(k, db.blobs);
  });
}

/**
 * P8: forget everything cached for one organization. A media id is its
 * Storage path (`organizations/<id>/attachments/<sha256>`), so the
 * organization is already in the key — leaving it is the whole condition.
 *
 * Called when the active organization changes: the blobs of the one being
 * left do not wait for the LRU or for sign-out, which is how an attachment
 * used to outlive the membership that fetched it.
 */
export function dropOrganizationMedia(
  userId: string,
  organizationId: string,
): Promise<void> {
  const db = disk();
  if (!db) return Promise.resolve();

  const prefix = `${key(userId, "organizations")}/${organizationId}/`;
  return serialized(async () => {
    for (const k of await keys<string>(db.index)) {
      if (typeof k === "string" && k.startsWith(prefix)) {
        await del(k, db.index);
        await del(k, db.blobs);
      }
    }
  });
}

export function clearMediaCache(): Promise<void> {
  const db = disk();
  if (!db) return Promise.resolve();

  return serialized(async () => {
    await clear(db.index);
    await clear(db.blobs);
  });
}

export async function diskUsage() {
  const db = disk();
  if (!db) return { entries: 0, bytes: 0 };

  const index = await entries<string, IndexEntry>(db.index);
  return {
    entries: index.length,
    bytes: index.reduce((sum, [, entry]) => sum + entry.size, 0),
  };
}
