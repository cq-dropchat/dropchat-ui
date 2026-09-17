import { describe, expect, it, beforeEach, vi } from "vitest";
import useBoundStore from "./useBoundStore";
import { timestampDescending } from "./chatSlice";
import { conversationRow, messageRow, ORG_A } from "@/test/factories";

function resetStore() {
  useBoundStore.setState((state) => ({
    // The factories' rows belong to organization A (F20: the store keeps only
    // the active organization's rows).
    ui: { ...state.ui, activeOrgId: ORG_A },
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

describe("chatSlice.pushMessages — legacy and updates (F10 safety net)", () => {
  beforeEach(resetStore);

  it("converts v0 rows to v1 on the way in", () => {
    const conv = conversationRow();
    const v0 = {
      ...messageRow({ conversation_id: conv.id }),
      direction: "incoming",
      content: { type: "text", content: "hola vieja" },
    } as unknown as ReturnType<typeof messageRow>;

    useBoundStore.getState().chat.pushMessages([v0]);

    const stored = useBoundStore
      .getState()
      .chat.messages.get(conv.id)!
      .get(v0.id)!;
    expect(stored.content).toMatchObject({
      version: "1",
      type: "text",
      text: "hola vieja",
    });
  });

  it("a status update replaces the row in place, keeping the order", () => {
    const conv = conversationRow();
    const older = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:00:00.000Z",
    });
    const newer = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:05:00.000Z",
    });
    useBoundStore.getState().chat.pushMessages([older, newer]);

    const read = {
      ...older,
      status: { delivered: "x", read: "2026-09-01T10:06:00.000Z" },
      updated_at: "2026-09-01T10:06:00.000Z",
    };
    useBoundStore.getState().chat.pushMessages([read]);

    const byConv = useBoundStore.getState().chat.messages.get(conv.id)!;
    expect([...byConv.keys()]).toEqual([newer.id, older.id]);
    expect(byConv.get(older.id)!.status).toMatchObject({
      read: read.status.read,
    });
  });

  it("a new newest message goes first", () => {
    const conv = conversationRow();
    const first = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:00:00.000Z",
    });
    useBoundStore.getState().chat.pushMessages([first]);
    const next = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:01:00.000Z",
    });
    useBoundStore.getState().chat.pushMessages([next]);

    expect([
      ...useBoundStore.getState().chat.messages.get(conv.id)!.keys(),
    ]).toEqual([next.id, first.id]);
  });

  it("an out-of-order older message is placed by timestamp", () => {
    const conv = conversationRow();
    const a = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:00:00.000Z",
    });
    const c = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:10:00.000Z",
    });
    useBoundStore.getState().chat.pushMessages([a, c]);
    const b = messageRow({
      conversation_id: conv.id,
      timestamp: "2026-09-01T10:05:00.000Z",
    });
    useBoundStore.getState().chat.pushMessages([b]);

    expect([
      ...useBoundStore.getState().chat.messages.get(conv.id)!.keys(),
    ]).toEqual([c.id, b.id, a.id]);
  });
});

describe("F10: realtime events do not re-sort the conversation", () => {
  beforeEach(resetStore);

  function bigConversation(n: number) {
    const conv = conversationRow();
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    const rows = Array.from({ length: n }, (_, i) =>
      messageRow({
        conversation_id: conv.id,
        timestamp: new Date(base + i * 1000).toISOString(),
      }),
    );
    useBoundStore.getState().chat.pushMessages(rows);
    return { conv, rows };
  }

  it("a status update on a 5,000-message conversation does not sort", () => {
    const { rows } = bigConversation(5000);
    const sort = vi.spyOn(Array.prototype, "sort");
    try {
      const target = rows[10];
      useBoundStore.getState().chat.pushMessages([
        {
          ...target,
          status: { read: "r" },
          updated_at: "2026-09-02T00:00:00.000Z",
        },
      ]);
      expect(sort).not.toHaveBeenCalled();
    } finally {
      sort.mockRestore();
    }
  });

  it("a new newest message on a 5,000-message conversation does not sort", () => {
    const { conv } = bigConversation(5000);
    const sort = vi.spyOn(Array.prototype, "sort");
    try {
      useBoundStore.getState().chat.pushMessages([
        messageRow({
          conversation_id: conv.id,
          timestamp: "2026-09-03T00:00:00.000Z",
        }),
      ]);
      expect(sort).not.toHaveBeenCalled();
    } finally {
      sort.mockRestore();
    }
  });
});
