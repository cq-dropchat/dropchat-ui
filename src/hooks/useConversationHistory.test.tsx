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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  HISTORY_PAGE_SIZE,
  useConversationHistory,
} from "./useConversationHistory";
import useBoundStore from "@/stores/useBoundStore";
import { emptyChatState } from "@/stores/chatSlice";
import { conversationRow, messageRow, ORG_A, ORG_B } from "@/test/factories";
import type { MessageRow } from "@/supabase/client";

const REST = "http://127.0.0.1:54321/rest/v1";
const CONV = "d9ef73c5-4006-48df-94cd-3ff39eb4ce7e";
const chatActions = useBoundStore.getState().chat;
let rows: MessageRow[];
let requests: URL[];

function id(n: number) {
  return `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

const server = setupServer(
  http.get(`${REST}/conversations`, () =>
    HttpResponse.json(conversationRow({ id: CONV })),
  ),
  http.get(`${REST}/messages`, ({ request }) => {
    const url = new URL(request.url);
    requests.push(url);
    const cursor = url.searchParams.get("or");
    const match = cursor?.match(
      /timestamp\.(?:lt|gt)\."([^"]+)",and\(timestamp\.eq\."[^"]+",id\.(?:lt|gt)\.([\w-]+)\)/,
    );
    const ascending = url.searchParams.get("order")?.includes("timestamp.asc");
    const ceiling = url.searchParams.get("timestamp")!.slice(4);
    return HttpResponse.json(
      rows
        .filter((m) => m.timestamp <= ceiling)
        .filter(
          (m) =>
            !match ||
            (ascending ? m.timestamp > match[1] : m.timestamp < match[1]) ||
            (m.timestamp === match[1] &&
              (ascending ? m.id > match[2] : m.id < match[2])),
        )
        .sort(
          (a, b) =>
            (ascending ? 1 : -1) *
            (a.timestamp.localeCompare(b.timestamp) ||
              a.id.localeCompare(b.id)),
        )
        .slice(0, HISTORY_PAGE_SIZE),
    );
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  requests = [];
  rows = Array.from({ length: 123 }, (_, i) =>
    messageRow({ id: id(i), conversation_id: CONV }),
  );
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      activeConvId: CONV,
      user: { id: "user-1" } as typeof state.ui.user,
    },
    chat: { ...chatActions, ...emptyChatState() },
  }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useConversationHistory(), { wrapper }), client };
}

describe("conversation history beyond the inbox preview", () => {
  it("loads the linked chat even when init_data did not return it", async () => {
    const { result } = setup();
    await waitFor(() =>
      expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(50),
    );
    expect(useBoundStore.getState().chat.conversations.get(CONV)?.id).toBe(
      CONV,
    );
    expect(result.current.hasOlder).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get("organization_id")).toBe(`eq.${ORG_A}`);
    expect(requests[0].searchParams.get("conversation_id")).toBe(`eq.${CONV}`);
    expect(requests[0].searchParams.get("order")).toBe(
      "timestamp.desc,id.desc",
    );
    expect(requests[0].searchParams.has("offset")).toBe(false);
  });

  it("loads every message across pages with identical timestamps and a sparse preview", async () => {
    // A preview can carry older scattered messages; it must not define the
    // cursor or cause the messages between it and the latest page to vanish.
    useBoundStore.getState().chat.pushMessages([rows[0], rows[80]]);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.loadOlder();
    });
    await act(async () => {
      await result.current.loadOlder();
    });
    await waitFor(() =>
      expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(123),
    );
    expect(result.current.hasOlder).toBe(false);
    expect([
      ...useBoundStore.getState().chat.messages.get(CONV)!.keys(),
    ]).toEqual(rows.map((m) => m.id).reverse());
    expect(requests).toHaveLength(3);
    expect(requests[1].searchParams.get("or")).toContain(`id.lt.${id(73)}`);
    expect(requests[2].searchParams.get("or")).toContain(`id.lt.${id(23)}`);
  });

  it("paginates by timestamp as well as ID and excludes scheduled messages", async () => {
    rows = rows.map((m, i) => ({
      ...m,
      timestamp: `2026-09-${String(1 + Math.floor(i / 10)).padStart(2, "0")}T10:00:00.000Z`,
      updated_at: "2026-10-01T10:00:00.000Z",
    }));
    rows.push(
      messageRow({
        id: id(999),
        conversation_id: CONV,
        timestamp: "2099-01-01T00:00:00Z",
      }),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.loadOlder();
    });
    await act(async () => {
      await result.current.loadOlder();
    });
    await waitFor(() => expect(result.current.hasOlder).toBe(false));
    expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(123);
    expect(requests).toHaveLength(3);
    expect(requests[1].searchParams.get("or")).toContain(
      'timestamp.lt."2026-09-08T10:00:00.000Z"',
    );
    expect(useBoundStore.getState().chat.messages.get(CONV)?.has(id(999))).toBe(
      false,
    );
  });

  it("can retry an unsuccessful older page without losing the cursor", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    server.use(
      http.get(`${REST}/messages`, () =>
        HttpResponse.json(
          { message: "temporarily unavailable" },
          { status: 503 },
        ),
      ),
    );
    await act(async () => {
      await result.current.loadOlder();
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(50);
    server.resetHandlers();
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() =>
      expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(100),
    );
    expect(result.current.error).toBeNull();
  });

  it("does not apply an old organization's response after switching away", async () => {
    server.use(
      http.get(`${REST}/messages`, async () => {
        await delay(150);
        return HttpResponse.json(rows.slice(0, 50));
      }),
    );
    const { result } = setup();
    act(() => useBoundStore.getState().ui.setActiveOrg(ORG_B));
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(useBoundStore.getState().chat.messages.size).toBe(0);
    expect(useBoundStore.getState().chat.conversations.size).toBe(0);
    expect(result.current.hasOlder).toBe(false);
  });

  it("reapplies cached history when returning to an organization", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => useBoundStore.getState().ui.setActiveOrg(ORG_B));
    act(() => {
      useBoundStore.getState().ui.setActiveOrg(ORG_A);
      useBoundStore.getState().ui.setActiveConv(CONV);
    });
    await waitFor(() =>
      expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(50),
    );
    expect(requests).toHaveLength(1);
  });
});

it("keeps a bounded bidirectional history without losing the latest inbox preview", async () => {
  rows = Array.from({ length: 1600 }, (_, i) =>
    messageRow({ id: id(i), conversation_id: CONV }),
  );
  const { result, client } = setup();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  for (let i = 0; i < 24; i++)
    await act(async () => {
      await result.current.loadOlder();
    });
  await waitFor(() => expect(result.current.hasNewer).toBe(true));
  expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(1000);
  expect(useBoundStore.getState().chat.messages.get(CONV)?.has(id(1599))).toBe(
    false,
  );
  expect(useBoundStore.getState().chat.previews.get(CONV)?.has(id(1599))).toBe(
    true,
  );
  expect(
    client.getQueryData<{ pages: unknown[] }>([
      ORG_A,
      "conversation_history",
      CONV,
      "user-1",
    ])?.pages,
  ).toHaveLength(20);
  server.use(
    http.get(`${REST}/messages`, () =>
      HttpResponse.json({ message: "unavailable" }, { status: 503 }),
    ),
  );
  await act(async () => {
    await result.current.loadNewer();
  });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  server.resetHandlers();
  await act(async () => {
    await result.current.retry();
  });
  expect(requests.at(-1)?.searchParams.get("order")).toBe(
    "timestamp.asc,id.asc",
  );
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await result.current.loadNewer();
    });
  expect(useBoundStore.getState().chat.messages.get(CONV)?.has(id(1599))).toBe(
    true,
  );
  expect(useBoundStore.getState().chat.messages.get(CONV)?.size).toBe(1000);
});
