import { describe, expect, it, beforeEach } from "vitest";
import useBoundStore from "./useBoundStore";
import { timestampDescending } from "./chatSlice";
import { conversationRow, messageRow } from "@/test/factories";

function resetStore() {
  useBoundStore.setState((state) => ({
    chat: {
      ...state.chat,
      conversations: new Map(),
      messages: new Map(),
      membershipExtras: new Map(),
      mediaLoads: new Map(),
    },
  }));
}

describe("timestampDescending", () => {
  it("orders newest first and is antisymmetric on ties", () => {
    const a = messageRow({ timestamp: "2026-09-01T10:00:00.000Z" });
    const b = messageRow({ timestamp: "2026-09-01T11:00:00.000Z" });
    expect(timestampDescending(a, b)).toBeGreaterThan(0);
    expect(timestampDescending(b, a)).toBeLessThan(0);
    expect(timestampDescending(a, a)).toBe(0);
  });

  it("breaks whole-second ties by created_at, then by id", () => {
    const older = messageRow({
      id: "d0000000-0000-4000-8000-000000000001",
      timestamp: "2026-09-01T10:00:00.000Z",
      created_at: "2026-09-01T10:00:00.100Z",
    });
    const newer = messageRow({
      id: "d0000000-0000-4000-8000-000000000002",
      timestamp: "2026-09-01T10:00:00.000Z",
      created_at: "2026-09-01T10:00:00.900Z",
    });
    expect([older, newer].sort(timestampDescending)[0]).toBe(newer);

    const sameCreated = messageRow({
      id: "d0000000-0000-4000-8000-000000000009",
      timestamp: newer.timestamp,
      created_at: newer.created_at,
    });
    // Deterministic: id descending.
    expect([newer, sameCreated].sort(timestampDescending)[0]).toBe(sameCreated);
  });
});

describe("chatSlice.pushMessages", () => {
  beforeEach(resetStore);

  it("groups by conversation, newest first", () => {
    const conv = conversationRow();
    const m1 = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:00:00.000Z",
    });
    const m2 = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:05:00.000Z",
    });

    useBoundStore.getState().chat.pushMessages([m1, m2]);

    const byConv = useBoundStore.getState().chat.messages.get(conv.id)!;
    expect([...byConv.keys()]).toEqual([m2.id, m1.id]);
  });

  it("keeps the cached row when the incoming one is older by updated_at", () => {
    const conv = conversationRow();
    const fresh = messageRow({
      conversation_id: conv.id,
      status: { delivered: "x", read: "y" },
      updated_at: "2026-09-01T10:10:00.000Z",
    });
    const stale = {
      ...fresh,
      status: {},
      updated_at: "2026-09-01T10:00:00.000Z",
    };

    useBoundStore.getState().chat.pushMessages([fresh]);
    useBoundStore.getState().chat.pushMessages([stale]);

    expect(
      useBoundStore.getState().chat.messages.get(conv.id)!.get(fresh.id)!
        .status,
    ).toEqual({ delivered: "x", read: "y" });
  });

  it("hides scheduled messages (timestamp in the future of updated_at)", () => {
    const conv = conversationRow();
    const scheduled = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-12-01T10:00:00.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
    });

    useBoundStore.getState().chat.pushMessages([scheduled]);

    expect(useBoundStore.getState().chat.messages.has(conv.id)).toBe(false);
  });
});

describe("chatSlice.pushConversations", () => {
  beforeEach(resetStore);

  it("does not let an older snapshot overwrite a newer one", () => {
    const newer = conversationRow({
      name: "renamed",
      updated_at: "2026-09-01T12:00:00.000Z",
    });
    const older = {
      ...newer,
      name: "old",
      updated_at: "2026-09-01T11:00:00.000Z",
    };

    useBoundStore.getState().chat.pushConversations([newer]);
    useBoundStore.getState().chat.pushConversations([older]);

    expect(
      useBoundStore.getState().chat.conversations.get(newer.id)!.name,
    ).toBe("renamed");
  });
});
