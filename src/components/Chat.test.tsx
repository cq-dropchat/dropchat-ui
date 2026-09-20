import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Chat from "./Chat";
import useBoundStore from "@/stores/useBoundStore";
import { conversationRow, messageRow } from "@/test/factories";
import type { MessageRow } from "@/supabase/client";

// F10 — Chat mounted every message of the open conversation: a long thread
// was thousands of Message components (markdown, media hooks, store
// subscriptions) on every open.

vi.mock("./Message/Message", () => ({
  default: ({ message }: { message: MessageRow }) => (
    <div data-testid="message">{message.id}</div>
  ),
}));
vi.mock("@/queries/useOrganizations", () => ({
  useCurrentOrganization: () => ({ data: { name: "Org A" } }),
}));
const role = { value: "owner" };

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { role: role.value } }),
  useCurrentAgents: () => ({ data: [] }),
}));

const CONV = "c0000000-0000-4000-8000-00000000f10a";
const ROW = 64;

function msgId(i: number) {
  return `d0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

function thread(count: number) {
  // The store keeps a conversation's messages newest first.
  const base = Date.parse("2026-09-01T00:00:00.000Z");
  const rows = Array.from({ length: count }, (_, i) =>
    messageRow({
      id: msgId(i),
      conversation_id: CONV,
      timestamp: new Date(base + i * 1000).toISOString(),
    }),
  ).reverse();
  return new Map(rows.map((m) => [m.id, m]));
}

beforeEach(() => {
  // jsdom has no layout: a screenful for the scroller, a bubble's height for
  // each measured row.
  const heightOf = (el: HTMLElement) =>
    el.dataset.index !== undefined ? ROW : 800;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return heightOf(this);
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const height = heightOf(this);
      return {
        width: 600,
        height,
        top: 0,
        left: 0,
        right: 600,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );
  Element.prototype.scrollTo = vi.fn();

  useBoundStore.setState((state) => ({
    ui: { ...state.ui, activeConvId: CONV },
    chat: {
      ...state.chat,
      conversations: new Map([[CONV, conversationRow({ id: CONV })]]),
      messages: new Map([[CONV, thread(5000)]]),
    },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F10: Chat is virtualized", () => {
  it("mounts a window of messages, not all 5,000", () => {
    render(<Chat />);

    const rows = screen.getAllByTestId("message");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
  });

  it("opens at the newest message", () => {
    render(<Chat />);

    const ids = screen.getAllByTestId("message").map((r) => r.textContent);
    expect(ids).toContain(msgId(4999));
    expect(ids).not.toContain(msgId(0));
  });

  it("a new message at the bottom is mounted", async () => {
    render(<Chat />);

    const incoming = messageRow({
      id: msgId(5000),
      conversation_id: CONV,
      timestamp: "2026-09-01T02:00:00.000Z",
    });
    await act(async () => {
      useBoundStore.setState((state) => ({
        chat: {
          ...state.chat,
          messages: new Map([
            [CONV, new Map([[incoming.id, incoming], ...thread(5000)])],
          ]),
        },
      }));
      await new Promise((r) => setTimeout(r, 0));
    });

    const ids = screen.getAllByTestId("message").map((r) => r.textContent);
    expect(ids).toContain(msgId(5000));
  });
});

// H6 — an assignment note says who is answering this conversation. It is
// internal (never dispatched), but it is not machinery: hiding it from
// everyone who is not an admin would hide the handover from the very people
// who have to act on it.
describe("H6: assignment notes are not admin-only", () => {
  function seedNotes() {
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    const rows = [
      messageRow({
        id: msgId(900),
        conversation_id: CONV,
        timestamp: new Date(base).toISOString(),
      }),
      {
        ...messageRow({
          id: msgId(901),
          conversation_id: CONV,
          timestamp: new Date(base + 1000).toISOString(),
        }),
        content: {
          version: "1",
          type: "data",
          kind: "assignment",
          internal: true,
          data: {
            from: null,
            to: null,
            awaiting_human: true,
            by: null,
            cause: "escalation",
          },
        },
      } as unknown as MessageRow,
      {
        ...messageRow({
          id: msgId(902),
          conversation_id: CONV,
          timestamp: new Date(base + 2000).toISOString(),
        }),
        content: {
          version: "1",
          type: "text",
          kind: "text",
          internal: true,
          text: "tool trace",
        },
      } as unknown as MessageRow,
    ].reverse();

    useBoundStore.setState((state) => ({
      ui: { ...state.ui, activeConvId: CONV },
      chat: {
        ...state.chat,
        conversations: new Map([[CONV, conversationRow({ id: CONV })]]),
        messages: new Map([[CONV, new Map(rows.map((m) => [m.id, m]))]]),
      },
    }));
  }

  it("shows the note to a member, and still hides the tool trace", () => {
    role.value = "member";
    seedNotes();

    render(<Chat />);

    const shown = screen.getAllByTestId("message").map((m) => m.textContent);

    expect(shown).toContain(msgId(901));
    expect(shown).not.toContain(msgId(902));
  });

  it("shows both to an admin, as before", () => {
    role.value = "owner";
    seedNotes();

    render(<Chat />);

    const shown = screen.getAllByTestId("message").map((m) => m.textContent);

    expect(shown).toContain(msgId(901));
    expect(shown).toContain(msgId(902));
  });
});
