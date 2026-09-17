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
      convOrder: [],
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

// F10 — ChatList rebuilt its order on every render: every conversation of the
// organization mapped to its newest message and sorted, O(n log n) with two
// Date parses per comparison. Measured in a production build at 50,000
// conversations and 50 events/s: 32 ms per commit on average (p95 72 ms).
// The store now keeps `convOrder` (conversation ids by newest message) and
// moves only the conversations a push touched.
describe("F10: convOrder", () => {
  /** What ChatList derived before convOrder existed. */
  function derivedOrder() {
    const { messages } = useBoundStore.getState().chat;
    return [...messages]
      .map(([convId, rows]) => ({
        convId,
        latest: rows.values().next().value as ReturnType<typeof messageRow>,
      }))
      .filter((c) => !!c.latest)
      .sort((a, b) => timestampDescending(a.latest, b.latest))
      .map((c) => c.convId);
  }

  beforeEach(resetStore);

  it("orders conversations by their newest message and moves one that gets a new message", () => {
    const push = useBoundStore.getState().chat.pushMessages;
    const convs = ["c-a", "c-b", "c-c"].map((id) => `${id}`);
    push([
      messageRow({
        conversation_id: convs[0],
        timestamp: "2026-09-01T10:00:00.000Z",
      }),
      messageRow({
        conversation_id: convs[1],
        timestamp: "2026-09-01T11:00:00.000Z",
      }),
      messageRow({
        conversation_id: convs[2],
        timestamp: "2026-09-01T12:00:00.000Z",
      }),
    ]);
    expect(useBoundStore.getState().chat.convOrder).toEqual([
      "c-c",
      "c-b",
      "c-a",
    ]);

    push([
      messageRow({
        conversation_id: "c-a",
        timestamp: "2026-09-01T13:00:00.000Z",
      }),
    ]);
    expect(useBoundStore.getState().chat.convOrder).toEqual([
      "c-a",
      "c-c",
      "c-b",
    ]);
  });

  it("a status update keeps the order (same array when nothing moved)", () => {
    const push = useBoundStore.getState().chat.pushMessages;
    const latest = messageRow({
      conversation_id: "c-x",
      timestamp: "2026-09-01T10:00:00.000Z",
    });
    push([
      latest,
      messageRow({
        conversation_id: "c-y",
        timestamp: "2026-09-01T09:00:00.000Z",
      }),
    ]);
    const before = useBoundStore.getState().chat.convOrder;

    push([
      {
        ...latest,
        status: { read: "2026-09-01T10:05:00.000Z" },
        updated_at: "2026-09-01T10:05:00.000Z",
      },
    ]);
    expect(useBoundStore.getState().chat.convOrder).toBe(before);
  });

  it("matches the previous derivation for 5,000 random conversations under interleaved events", () => {
    const push = useBoundStore.getState().chat.pushMessages;
    let seed = 42;
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    const at = (ms: number) => new Date(base + ms).toISOString();
    const conv = (i: number) =>
      `c1000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const all: ReturnType<typeof messageRow>[] = [];

    // A first load in one big batch (the init_data path: a full sort).
    push(
      Array.from({ length: 5000 }, (_, i) => {
        // Whole seconds: ties between conversations happen.
        const ts = at(Math.floor(random() * 86_400) * 1000);
        const row = messageRow({
          conversation_id: conv(i),
          timestamp: ts,
          created_at: ts,
          updated_at: ts,
        });
        all.push(row);
        return row;
      }),
    );
    expect(useBoundStore.getState().chat.convOrder).toEqual(derivedOrder());

    // Then realtime: small batches mixing new messages (some older than the
    // conversation's newest), status updates and repeats.
    for (let round = 0; round < 300; round++) {
      const batch: ReturnType<typeof messageRow>[] = [];
      const size = 1 + Math.floor(random() * 5);
      for (let k = 0; k < size; k++) {
        const kind = random();
        if (kind < 0.5) {
          const ts = at(Math.floor(random() * 100_000) * 1000);
          const row = messageRow({
            conversation_id: conv(Math.floor(random() * 5000)),
            timestamp: ts,
            created_at: ts,
            updated_at: ts,
          });
          all.push(row);
          batch.push(row);
        } else {
          const row = all[Math.floor(random() * all.length)];
          const later = at(200_000_000 + round * 1000);
          batch.push({ ...row, status: { read: later }, updated_at: later });
        }
      }
      push(batch);
      if (round % 50 === 0) {
        expect(useBoundStore.getState().chat.convOrder).toEqual(derivedOrder());
      }
    }
    expect(useBoundStore.getState().chat.convOrder).toEqual(derivedOrder());

    // A burst larger than the insertion limit rebuilds and still agrees.
    push(
      Array.from({ length: 500 }, (_, i) => {
        const ts = at(300_000_000 + i * 1000);
        return messageRow({
          conversation_id: conv(i * 7),
          timestamp: ts,
          created_at: ts,
          updated_at: ts,
        });
      }),
    );
    expect(useBoundStore.getState().chat.convOrder).toEqual(derivedOrder());
  });

  it("starts empty for a new organization or user (F20)", () => {
    useBoundStore
      .getState()
      .chat.pushMessages([messageRow({ conversation_id: "c-z" })]);
    expect(useBoundStore.getState().chat.convOrder.length).toBe(1);
    useBoundStore
      .getState()
      .ui.setActiveOrg("bbbbbbbb-0000-4000-8000-000000000001");
    expect(useBoundStore.getState().chat.convOrder).toEqual([]);
  });
});
