import { afterEach, describe, expect, it, vi } from "vitest";
import { createNoticeBatcher, type RealtimeNotice } from "./realtimeNotices";
import { messageRow, ORG_A, ORG_B } from "@/test/factories";
const notice = (id: string): RealtimeNotice => ({
  table: "messages",
  op: "UPDATE",
  id,
  organization_id: ORG_A,
  conversation_id: "chat",
  updated_at: "2026-09-01T12:00:00Z",
});
afterEach(() => vi.useRealTimers());
describe("bounded realtime recovery", () => {
  it("serializes chunks even when more notices arrive during a slow fetch", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMessages = vi.fn(async (ids: string[]) => {
      await gate;
      return ids.map((id) => messageRow({ id }));
    });
    const batcher = createNoticeBatcher({
      chunkSize: 2,
      activeOrgId: () => ORG_A,
      fetchMessages,
      fetchConversations: () => Promise.resolve([]),
      onMessages: vi.fn(),
      onConversations: vi.fn(),
    });
    for (let i = 0; i < 6; i++) batcher.push(notice(String(i)));
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMessages).toHaveBeenCalledTimes(1);
    batcher.push(notice("new"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMessages).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMessages.mock.calls.flatMap(([ids]) => ids)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "new",
    ]);
    batcher.dispose();
  });
  it("retries failed IDs without losing a successful conversation batch", async () => {
    vi.useFakeTimers();
    const fetchMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue([messageRow({ id: "1" })]);
    const onMessages = vi.fn(),
      onError = vi.fn();
    const batcher = createNoticeBatcher({
      activeOrgId: () => ORG_A,
      fetchMessages,
      fetchConversations: () => Promise.resolve([]),
      onMessages,
      onConversations: vi.fn(),
      onError,
    });
    batcher.push(notice("1"));
    await vi.advanceTimersByTimeAsync(750);
    expect(fetchMessages).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onMessages).toHaveBeenCalledTimes(1);
    batcher.dispose();
  });
  it("skips a revision received as a full row before the batch flush", async () => {
    vi.useFakeTimers();
    let current = false;
    const fetchMessages = vi.fn(() => Promise.resolve([]));
    const batcher = createNoticeBatcher({
      activeOrgId: () => ORG_A,
      isCurrent: () => current,
      fetchMessages,
      fetchConversations: () => Promise.resolve([]),
      onMessages: vi.fn(),
      onConversations: vi.fn(),
    });
    batcher.push(notice("1"));
    current = true;
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMessages).not.toHaveBeenCalled();
    batcher.dispose();
  });
  it("drops in-flight rows and retries after a tenant switch or disposal", async () => {
    vi.useFakeTimers();
    let org = ORG_A;
    let release!: (rows: ReturnType<typeof messageRow>[]) => void;
    const onMessages = vi.fn();
    const batcher = createNoticeBatcher({
      activeOrgId: () => org,
      fetchMessages: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      fetchConversations: () => Promise.resolve([]),
      onMessages,
      onConversations: vi.fn(),
    });
    batcher.push(notice("1"));
    await vi.advanceTimersByTimeAsync(250);
    org = ORG_B;
    release([messageRow()]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onMessages).not.toHaveBeenCalled();
    batcher.dispose();
  });
});
