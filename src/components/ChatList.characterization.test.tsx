import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen } from "@testing-library/react";
import ChatList from "./ChatList";
import useBoundStore from "@/stores/useBoundStore";
import { Filters } from "@/stores/uiSlice";
import { orderConversations } from "@/stores/chatSlice";
import type {
  ConversationAgentExtra,
  ConversationRow,
  MessageRow,
} from "@/supabase/client";
import {
  AGENT_ALICE,
  conversationRow,
  messageRow,
  ORG_A,
  outgoingMessageRow,
} from "@/test/factories";

// P6 — characterization, recorded BEFORE the render-cost work of P6 touches
// ChatList or the chat slice. It pins what the list shows and in what order
// for every filter, for pins, for search and when nothing matches, and what
// the store holds after a scripted run of realtime events. None of P6 is
// meant to change any of it: a moved snapshot is a bug, not a new baseline.
//
// Deliberately observed through the rendered DOM and through the store's
// public reads, not through internals, so the same snapshots survive the
// change of the root Map's identity (P6 point 2).

const NOW = "2026-09-02T12:00:00.000Z";

/** Conversation ids are the fixture's vocabulary; keep them readable. */
const conv = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  // jsdom has no layout: a screenful for the scroller, the estimate per row,
  // so the whole (small) fixture is inside the window and order is visible.
  const heightOf = (el: HTMLElement) =>
    el.dataset.index !== undefined ? 76 : 800;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return heightOf(this);
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const height = heightOf(this);
      return {
        width: 400,
        height,
        top: 0,
        left: 0,
        right: 400,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock("./ChatListItem", () => ({
  default: ({ itemId }: { itemId: string }) => (
    <div data-testid="chat-list-item">{itemId}</div>
  ),
}));

/**
 * Eight conversations, newest message first: 7, 6, 5 … 0.
 * - 7 and 5 end with an outgoing message (out of "pendientes")
 * - 3 is archived after its newest message, 2 is archived before it
 * - 6 and 1 are pinned (6 pinned later than 1)
 * - 0 is older than a day (out of "24h")
 */
function seed() {
  const conversations = new Map<string, ConversationRow>();
  const messages = new Map<string, Map<string, MessageRow>>();
  const membershipExtras = new Map<string, ConversationAgentExtra>();
  const day = 24 * 60 * 60 * 1000;
  const base = Date.parse(NOW) - 8 * 60 * 1000;

  for (let i = 0; i < 8; i++) {
    const id = conv(i);
    conversations.set(
      id,
      conversationRow({ id, name: `Contacto ${i}`, address: `5491100000${i}` }),
    );
    const at = new Date(i === 0 ? base - 2 * day : base + i * 60_000);
    const row = (i === 7 || i === 5 ? outgoingMessageRow : messageRow)({
      conversation_id: id,
      timestamp: at.toISOString(),
    });
    messages.set(id, new Map([[row.id, row]]));
  }

  // Archived after its newest message (3) and before it (2).
  membershipExtras.set(conv(3), { archived: NOW });
  membershipExtras.set(conv(2), { archived: "2026-01-01T00:00:00.000Z" });
  membershipExtras.set(conv(1), { pinned: "2026-08-01T00:00:00.000Z" });
  membershipExtras.set(conv(6), { pinned: "2026-08-20T00:00:00.000Z" });

  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      filter: Filters.ALL,
      searchPattern: "",
    },
    chat: {
      ...state.chat,
      ownAgentId: AGENT_ALICE,
      conversations,
      messages,
      membershipExtras,
      convOrder: orderConversations(messages),
    },
  }));
}

/** The conversation ids the list renders, in the order it renders them. */
function renderedIds() {
  render(<ChatList />);
  return screen
    .queryAllByTestId("chat-list-item")
    .map((el) => el.textContent?.replace("c0000000-0000-4000-8000-", "") ?? "");
}

function withUi(patch: { filter?: Filters; searchPattern?: string }) {
  useBoundStore.setState((state) => ({ ui: { ...state.ui, ...patch } }));
}

it("filter: todas", () => {
  seed();
  expect(renderedIds()).toMatchSnapshot();
});

it("filter: pendientes", () => {
  seed();
  withUi({ filter: Filters.UNREAD });
  expect(renderedIds()).toMatchSnapshot();
});

it("filter: 24h", () => {
  seed();
  withUi({ filter: Filters.H24 });
  expect(renderedIds()).toMatchSnapshot();
});

it("filter: archivadas", () => {
  seed();
  withUi({ filter: Filters.ARCHIVED });
  expect(renderedIds()).toMatchSnapshot();
});

it("search by name", () => {
  seed();
  withUi({ searchPattern: "Contacto 4" });
  expect(renderedIds()).toMatchSnapshot();
});

it("nothing matches", () => {
  seed();
  withUi({ searchPattern: "no existe nadie así" });
  expect(renderedIds()).toMatchSnapshot();
});

it("a conversation of another organization, and one without messages", () => {
  seed();
  useBoundStore.setState((state) => {
    const conversations = new Map(state.chat.conversations);
    const messages = new Map(state.chat.messages);
    const foreign = conversationRow({
      id: conv(90),
      organization_id: "bbbbbbbb-0000-4000-8000-000000000001",
      name: "Ajena",
    });
    conversations.set(foreign.id, foreign);
    messages.set(
      foreign.id,
      new Map([
        [
          "d0000000-0000-4000-8000-000000000090",
          messageRow({
            id: "d0000000-0000-4000-8000-000000000090",
            conversation_id: foreign.id,
            organization_id: foreign.organization_id,
            timestamp: NOW,
          }),
        ],
      ]),
    );
    conversations.set(
      conv(91),
      conversationRow({ id: conv(91), name: "Muda" }),
    );
    return {
      chat: {
        ...state.chat,
        conversations,
        messages,
        convOrder: orderConversations(messages),
      },
    };
  });
  expect(renderedIds()).toMatchSnapshot();
});

it("the store after a scripted run of events", () => {
  seed();
  const push = useBoundStore.getState().chat.pushMessages;

  // A new message on an old conversation, a status update on the newest one,
  // an out-of-order older message, and a second message on a pinned one.
  const fresh = messageRow({
    id: "d0000000-0000-4000-8000-0000000000f1",
    conversation_id: conv(0),
    timestamp: "2026-09-02T11:59:00.000Z",
  });
  push([fresh]);

  const newest = [
    ...useBoundStore.getState().chat.messages.get(conv(7))!.values(),
  ][0];
  push([
    {
      ...newest,
      status: { ...newest.status, read: NOW },
      updated_at: NOW,
    },
  ]);

  push([
    messageRow({
      id: "d0000000-0000-4000-8000-0000000000f2",
      conversation_id: conv(4),
      timestamp: "2026-09-01T00:00:00.000Z",
    }),
  ]);
  push([
    messageRow({
      id: "d0000000-0000-4000-8000-0000000000f3",
      conversation_id: conv(6),
      timestamp: "2026-09-02T11:59:30.000Z",
    }),
  ]);

  const { convOrder, messages } = useBoundStore.getState().chat;
  expect({
    convOrder: convOrder.map((id) =>
      id.replace("c0000000-0000-4000-8000-", ""),
    ),
    rows: Object.fromEntries(
      convOrder.map((id) => [
        id.replace("c0000000-0000-4000-8000-", ""),
        [...messages.get(id)!.values()].map((m) => ({
          id: m.id.replace("d0000000-0000-4000-8000-", ""),
          timestamp: m.timestamp,
          status: m.status,
        })),
      ]),
    ),
  }).toMatchSnapshot();

  expect(renderedIds()).toMatchSnapshot();
});
