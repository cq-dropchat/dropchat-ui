import "fake-indexeddb/auto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { User } from "@supabase/supabase-js";
import ImageMessage from "./ImageMessage";
import AudioMessage from "./AudioMessage";
import useBoundStore from "@/stores/useBoundStore";
import { fileMessageRow, ORG_A } from "@/test/factories";
import { clearMediaCache } from "@/utils/mediaCache";

// F21 — ImageMessage downloaded every attachment younger than a day as soon
// as it mounted, visible or not, and built a new ObjectURL on every render;
// AudioMessage built one per blob. None was revoked, so each kept its blob
// alive for the life of the document.

let downloads = 0;
const server = setupServer(
  http.get("*/storage/v1/object/media/*", () => {
    downloads++;
    return new HttpResponse(new Uint8Array([1, 2, 3]));
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

/** An IntersectionObserver the test drives. */
class ControlledObserver {
  static instances: ControlledObserver[] = [];
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
  private targets = new Set<Element>();
  private callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    ControlledObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
  static intersect(isIntersecting: boolean) {
    for (const observer of ControlledObserver.instances) {
      const entries = [...observer.targets].map(
        (target) =>
          ({ target, isIntersecting }) as unknown as IntersectionObserverEntry,
      );
      if (entries.length) {
        observer.callback(entries, observer as unknown as IntersectionObserver);
      }
    }
  }
}

const originalObserver = window.IntersectionObserver;
let created: string[] = [];
let revoked: string[] = [];

beforeEach(async () => {
  downloads = 0;
  created = [];
  revoked = [];
  ControlledObserver.instances = [];
  window.IntersectionObserver =
    ControlledObserver as unknown as typeof IntersectionObserver;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const url = `blob:test/${created.length}`;
    created.push(url);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    revoked.push(url);
  });
  await clearMediaCache();
  useBoundStore.getState().ui.setUser({ id: "user-a" } as User);
  useBoundStore.getState().ui.setActiveOrg(ORG_A);
});

afterEach(() => {
  window.IntersectionObserver = originalObserver;
  vi.restoreAllMocks();
});

const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));

function recentImage() {
  return fileMessageRow({ timestamp: new Date().toISOString() });
}

function withBlob(id: string) {
  useBoundStore.getState().chat.setMediaLoad(id, {
    type: "download",
    status: "done",
    blob: new Blob(["img"], { type: "image/jpeg" }),
  });
}

describe("F21: media is downloaded when it is seen", () => {
  it("a recent image outside the viewport is not downloaded", async () => {
    render(<ImageMessage {...recentImage()} />);
    await settle();

    expect(downloads).toBe(0);
  });

  it("it is downloaded when it scrolls into view", async () => {
    render(<ImageMessage {...recentImage()} />);
    await settle();

    act(() => ControlledObserver.intersect(true));
    await settle();

    expect(downloads).toBe(1);
  });

  it("an old image in view still waits for a click", async () => {
    render(
      <ImageMessage
        {...fileMessageRow({ timestamp: "2020-01-01T00:00:00Z" })}
      />,
    );
    act(() => ControlledObserver.intersect(true));
    await settle();

    expect(downloads).toBe(0);
  });
});

describe("F21: object URLs", () => {
  it("an image builds one URL for its blob, not one per render, and revokes it on unmount", async () => {
    const message = fileMessageRow();
    withBlob(message.id);

    const { rerender, unmount } = render(<ImageMessage {...message} />);
    rerender(<ImageMessage {...message} />);
    rerender(<ImageMessage {...message} />);
    await settle();

    expect(created).toHaveLength(1);

    unmount();
    expect(revoked).toEqual(created);
  });

  it("an audio revokes its URL on unmount", async () => {
    const message = fileMessageRow(
      {},
      { mime_type: "audio/ogg", name: "nota.ogg" },
    );
    message.content = {
      ...message.content,
      kind: "audio",
    } as typeof message.content;
    withBlob(message.id);

    const { unmount } = render(
      <AudioMessage message={message} orgName="Org" convName="Conv" />,
    );
    await settle();
    expect(created).toHaveLength(1);

    unmount();
    expect(revoked).toEqual(created);
  });
});
