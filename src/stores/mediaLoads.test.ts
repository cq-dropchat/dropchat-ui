import { beforeEach, describe, expect, it } from "vitest";
import useBoundStore from "./useBoundStore";
import type { MediaLoad } from "./chatSlice";
import {
  MEDIA_MEMORY_BUDGET,
  releaseMedia,
  retainMedia,
} from "@/utils/mediaCache";

// F21 — `mediaLoads` kept every blob ever opened: a long session grew the
// heap with each attachment. Now the blobs share a memory budget and the
// least recently used one leaves first; a mounted message's blob and an
// upload still waiting for its file stay.

const MB = 1024 * 1024;
const third = Math.floor(MEDIA_MEMORY_BUDGET / 2.5); // two fit, three do not

function blobOf(size: number) {
  // Only `size` is read by the budget; no bytes are allocated.
  return { size } as Blob;
}

function downloaded(size = third): MediaLoad {
  return { type: "download", status: "done", blob: blobOf(size) };
}

function set(id: string, load: MediaLoad) {
  useBoundStore.getState().chat.setMediaLoad(id, load);
}

function loads() {
  return useBoundStore.getState().chat.mediaLoads;
}

beforeEach(() => {
  for (const id of ["a", "b", "c"]) {
    while (releaseMedia(id));
  }
  useBoundStore.setState((state) => ({
    chat: { ...state.chat, mediaLoads: new Map() },
  }));
});

describe("F21: media blobs in memory", () => {
  it("the budget is 50 MB", () => {
    expect(MEDIA_MEMORY_BUDGET).toBe(50 * MB);
  });

  it("past the budget, the least recently used blob is evicted", () => {
    set("a", downloaded());
    set("b", downloaded());
    set("c", downloaded());

    expect(loads().has("a")).toBe(false);
    expect(loads().get("b")?.blob).toBeDefined();
    expect(loads().get("c")?.blob).toBeDefined();
  });

  it("a blob in use (its message is mounted) is not evicted", () => {
    set("a", downloaded());
    retainMedia("a");
    set("b", downloaded());
    set("c", downloaded());

    expect(loads().get("a")?.blob).toBeDefined();
    expect(loads().has("b")).toBe(false);
  });

  it("showing a blob again makes it recent", () => {
    set("a", downloaded());
    set("b", downloaded());
    retainMedia("a");
    releaseMedia("a");
    set("c", downloaded());

    expect(loads().get("a")?.blob).toBeDefined();
    expect(loads().has("b")).toBe(false);
  });

  it("an upload not yet done keeps its file: it is the only copy", () => {
    set("a", { type: "upload", status: "pending", blob: blobOf(third) });
    set("b", downloaded());
    set("c", downloaded());

    expect(loads().get("a")?.blob).toBeDefined();
    expect(loads().has("b")).toBe(false);
  });

  it("entries without a blob cost nothing", () => {
    set("a", { type: "download", status: "loading" });
    set("b", downloaded());
    set("c", downloaded());

    expect(loads().get("a")?.status).toBe("loading");
  });
});
