import "fake-indexeddb/auto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { User } from "@supabase/supabase-js";
import { useMedia } from "./useMedia";
import useBoundStore from "@/stores/useBoundStore";
import { fileMessageRow, ORG_A } from "@/test/factories";
import {
  cacheBlob,
  clearMediaCache,
  diskUsage,
  forgetCachedBlob,
  readCachedBlob,
} from "@/utils/mediaCache";
import { ORG_B } from "@/test/factories";

// F21 — `idb-keyval` was installed and unused for media: a blob evicted from
// memory, or any attachment after a reload, went back to the network. Now a
// download is kept in IndexedDB under the signed-in user, within a budget,
// and the cache is emptied when the user signs out or another one signs in.

let downloads: string[] = [];

const server = setupServer(
  http.get("*/storage/v1/object/media/*", ({ request }) => {
    downloads.push(new URL(request.url).pathname);
    return new HttpResponse(new Uint8Array([1, 2, 3, 4]), {
      headers: { "content-type": "image/jpeg" },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

function signIn(id: string) {
  useBoundStore.getState().ui.setUser({ id } as User);
  useBoundStore.getState().ui.setActiveOrg(ORG_A);
}

async function download(message = fileMessageRow()) {
  const { result, unmount } = renderHook(() => useMedia(message));
  act(() => result.current.startLoad());
  await waitFor(() => expect(result.current.load.status).toBe("done"));
  const size = result.current.load.blob?.size;
  unmount();
  return size;
}

function evictAllFromMemory() {
  useBoundStore.setState((state) => ({
    chat: { ...state.chat, mediaLoads: new Map() },
  }));
}

beforeEach(async () => {
  downloads = [];
  await clearMediaCache();
  useBoundStore.getState().ui.setUser(null);
  signIn("user-a");
});

describe("F21: media cache in IndexedDB", () => {
  it("a blob evicted from memory is read back from disk, not downloaded again", async () => {
    const message = fileMessageRow();

    expect(await download(message)).toBe(4);
    expect(downloads).toHaveLength(1);

    evictAllFromMemory();
    await waitFor(async () => expect((await diskUsage()).entries).toBe(1));

    expect(await download(message)).toBe(4);
    expect(downloads).toHaveLength(1);
  });

  it("another user on the same browser does not read the previous user's cache", async () => {
    const message = fileMessageRow();
    await download(message);
    await waitFor(async () => expect((await diskUsage()).entries).toBe(1));

    signIn("user-b");
    await waitFor(async () => expect((await diskUsage()).entries).toBe(0));

    await download(message);
    expect(downloads).toHaveLength(2);
    expect(
      await readCachedBlob(
        "user-a",
        `organizations/${ORG_A}/attachments/file-1`,
      ),
    ).toBeUndefined();
  });

  it("signing out empties the cache", async () => {
    await download();
    await waitFor(async () => expect((await diskUsage()).entries).toBe(1));

    useBoundStore.getState().ui.setUser(null);

    await waitFor(async () => expect((await diskUsage()).entries).toBe(0));
  });

  it("keys are per user: a hit for one user is a miss for another", async () => {
    await cacheBlob("user-a", "m1", new Blob(["x"]));

    expect(await readCachedBlob("user-a", "m1")).toBeDefined();
    expect(await readCachedBlob("user-b", "m1")).toBeUndefined();
  });

  it("past the disk budget the least recently used blobs leave", async () => {
    const budget = 10;
    await cacheBlob("user-a", "old", new Blob(["1234"]), budget);
    await cacheBlob("user-a", "mid", new Blob(["1234"]), budget);
    await readCachedBlob("user-a", "old"); // used again: now the newest
    await cacheBlob("user-a", "new", new Blob(["1234"]), budget);

    expect(await readCachedBlob("user-a", "mid")).toBeUndefined();
    expect(await readCachedBlob("user-a", "old")).toBeDefined();
    expect(await readCachedBlob("user-a", "new")).toBeDefined();
    expect((await diskUsage()).bytes).toBeLessThanOrEqual(budget);
  });

  it("a blob larger than the whole budget is not cached", async () => {
    await cacheBlob("user-a", "huge", new Blob(["12345678901"]), 10);

    expect(await readCachedBlob("user-a", "huge")).toBeUndefined();
  });
});

// P8 — a cached attachment outlived the access that fetched it: it survived
// losing the organization and it survived F18 deleting the file, until the LRU
// evicted it or the user signed out. Media keys carry the organization
// (`organizations/<id>/attachments/<sha>`), so leaving one is enough to know
// what to drop.
describe("P8: a cached attachment does not outlive the access to it", () => {
  const inA = `organizations/${ORG_A}/attachments/file-1`;
  const inB = `organizations/${ORG_B}/attachments/file-9`;

  it("switching organization drops the previous one's blobs, and only those", async () => {
    await cacheBlob("user-a", inA, new Blob(["1234"]));
    await cacheBlob("user-a", inB, new Blob(["1234"]));

    useBoundStore.getState().ui.setActiveOrg(ORG_B);

    await waitFor(async () =>
      expect(await readCachedBlob("user-a", inA)).toBeUndefined(),
    );
    expect(await readCachedBlob("user-a", inB)).toBeDefined();
  });

  // A cached blob is served without asking the server, so the download that
  // learns the object is gone is by definition one the cache missed. What the
  // 404/403 path is for is the entry left behind when that happens — and not
  // writing a new one.
  it("a download that is gone or refused caches nothing", async () => {
    server.use(
      http.get("*/storage/v1/object/media/*", () =>
        HttpResponse.json({ message: "Object not found" }, { status: 404 }),
      ),
    );

    // One row, made once: rendering with a fresh id each time would key the
    // load in the store to a message the next render no longer asks about.
    const message = fileMessageRow();
    const { result, unmount } = renderHook(() => useMedia(message));
    act(() => result.current.startLoad());
    await waitFor(() => expect(result.current.load.status).toBe("error"));
    unmount();

    expect((await diskUsage()).entries).toBe(0);
    expect(await readCachedBlob("user-a", inA)).toBeUndefined();
  });

  it("forgetting one blob leaves the rest of the cache alone", async () => {
    await cacheBlob("user-a", inA, new Blob(["1234"]));
    await cacheBlob("user-a", inB, new Blob(["1234"]));

    await forgetCachedBlob("user-a", inA);

    expect(await readCachedBlob("user-a", inA)).toBeUndefined();
    expect(await readCachedBlob("user-a", inB)).toBeDefined();
    expect((await diskUsage()).entries).toBe(1);
  });
});
