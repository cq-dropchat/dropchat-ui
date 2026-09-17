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
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { supabase } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { useRealtimeSubscription } from "./useRealtimeSubscription";
import { conversationRow, messageRow, ORG_A, ORG_B } from "@/test/factories";

// F10 — the tab subscribed to postgres_changes on messages and conversations
// for the whole organization: every status update of every conversation
// arrived as a full row, each handled on its own. In broadcast mode the tab
// joins private channels (org:, agent:, conv:), receives notices without
// content, and fetches the rows they name in one request per window.

const REST = "http://127.0.0.1:54321/rest/v1";

type Handler = (message: { event: string; payload: unknown }) => void;

const channels = new Map<string, { handler?: Handler; closed: boolean }>();
const joined: string[] = [];
let channelSpy: ReturnType<typeof fakeChannels>;

function fakeChannels() {
  return vi.spyOn(supabase, "channel").mockImplementation(((topic: string) => {
    const state: { handler?: Handler; closed: boolean } = { closed: false };
    channels.set(topic, state);
    joined.push(topic);
    const channel = {
      on: (_type: string, _filter: unknown, handler: Handler) => {
        state.handler = handler;
        return channel;
      },
      subscribe: () => channel,
      unsubscribe: () => {
        state.closed = true;
        return Promise.resolve("ok");
      },
    };
    return channel;
  }) as unknown as typeof supabase.channel);
}

function emit(topic: string, event: string, payload: unknown) {
  const channel = channels.get(topic);
  if (!channel?.handler) throw new Error(`not subscribed to ${topic}`);
  channel.handler({ event, payload });
}

const CONV_1 = "c1000000-0000-4000-8000-000000000001";
const CONV_2 = "c1000000-0000-4000-8000-000000000002";

let messageRequests: URL[] = [];

const server = setupServer(
  http.get(`${REST}/messages`, ({ request }) => {
    const url = new URL(request.url);
    messageRequests.push(url);
    const ids = (url.searchParams.get("id") ?? "")
      .replace(/^in\.\(/, "")
      .replace(/\)$/, "")
      .split(",")
      .filter(Boolean);
    return HttpResponse.json(
      ids.map((id) =>
        messageRow({ id, conversation_id: CONV_1, organization_id: ORG_A }),
      ),
    );
  }),
  http.get(`${REST}/conversations`, () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  channels.clear();
  joined.length = 0;
  messageRequests = [];
  channelSpy = fakeChannels();
  useBoundStore.setState((state) => ({
    ui: { ...state.ui, activeOrgId: ORG_A, activeConvId: CONV_1 },
    chat: {
      ...state.chat,
      ownAgentId: "aaaaaaaa-0000-4000-8000-00000000a0a1",
      conversations: new Map([
        [CONV_1, conversationRow({ id: CONV_1, organization_id: ORG_A })],
        [CONV_2, conversationRow({ id: CONV_2, organization_id: ORG_A })],
      ]),
      messages: new Map(),
    },
  }));
});

function notice(id: string, organization_id = ORG_A) {
  return {
    table: "messages",
    op: "UPDATE",
    id,
    organization_id,
    conversation_id: CONV_1,
    updated_at: new Date().toISOString(),
    status_changed: ["read"],
  };
}

describe("F10: broadcast mode", () => {
  it("joins org:, agent: and the open conversation's conv: as private channels", () => {
    renderHook(() => useRealtimeSubscription("broadcast"));
    expect([...joined].sort()).toEqual(
      [
        `org:${ORG_A}`,
        "agent:aaaaaaaa-0000-4000-8000-00000000a0a1",
        `conv:${CONV_1}`,
      ].sort(),
    );
    expect(channelSpy).toHaveBeenCalledWith(`org:${ORG_A}`, {
      config: { private: true },
    });
  });

  it("groups a burst of notices into one request for the rows", async () => {
    renderHook(() => useRealtimeSubscription("broadcast"));
    const ids = Array.from(
      { length: 12 },
      (_, i) => `d1000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );

    act(() => {
      for (const id of ids) emit(`org:${ORG_A}`, "messages", notice(id));
    });

    await waitFor(() =>
      expect(useBoundStore.getState().chat.messages.get(CONV_1)?.size).toBe(12),
    );
    expect(messageRequests).toHaveLength(1);
    expect(messageRequests[0].searchParams.get("id")).toBe(
      `in.(${ids.join(",")})`,
    );
  });

  it("ignores a notice of another organization", async () => {
    renderHook(() => useRealtimeSubscription("broadcast"));
    act(() =>
      emit(
        `org:${ORG_A}`,
        "messages",
        notice("d1000000-0000-4000-8000-00000000000b", ORG_B),
      ),
    );
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(messageRequests).toHaveLength(0);
  });

  it("pushes a conv: row straight to the store", () => {
    renderHook(() => useRealtimeSubscription("broadcast"));
    const row = messageRow({
      id: "d1000000-0000-4000-8000-00000000c0c0",
      conversation_id: CONV_1,
      organization_id: ORG_A,
    });
    act(() =>
      emit(`conv:${CONV_1}`, "messages", {
        table: "messages",
        op: "INSERT",
        record: row,
      }),
    );
    expect(
      useBoundStore.getState().chat.messages.get(CONV_1)?.has(row.id),
    ).toBe(true);
    expect(messageRequests).toHaveLength(0);
  });

  it("re-subscribes conv: when the open conversation changes, and only that channel", () => {
    renderHook(() => useRealtimeSubscription("broadcast"));
    const orgChannels = joined.filter((t) => t.startsWith("org:")).length;

    act(() => useBoundStore.getState().ui.setActiveConv(CONV_2));

    expect(channels.get(`conv:${CONV_1}`)?.closed).toBe(true);
    expect(channels.get(`conv:${CONV_2}`)?.closed).toBe(false);
    expect(joined.filter((t) => t.startsWith("org:")).length).toBe(orgChannels);
  });
});

describe("F10: postgres_changes mode (rollback path)", () => {
  it("keeps the organization-wide postgres_changes subscription", () => {
    renderHook(() => useRealtimeSubscription("postgres_changes"));
    expect(joined).toEqual(["rialtaim"]);
  });
});
