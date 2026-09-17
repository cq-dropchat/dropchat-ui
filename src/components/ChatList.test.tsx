import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatList from "./ChatList";
import useBoundStore from "@/stores/useBoundStore";
import { Filters } from "@/stores/uiSlice";
import { conversationRow, messageRow, ORG_A } from "@/test/factories";

// The item's own data hooks are not what is under test here.
vi.mock("./ChatListItem", () => ({
  default: ({ itemId }: { itemId: string }) => (
    <div data-testid="chat-list-item">{itemId}</div>
  ),
}));

// F10 — ChatList rendered every conversation of the organization at once:
// 5,000 ChatListItems, each subscribed to the store and running its queries.

beforeEach(() => {
  // jsdom has no layout: give the scroll container a screen's height and each
  // row its estimated height, which is what a browser would report.
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

  const conversations = new Map();
  const messages = new Map();
  const base = Date.parse("2026-09-01T00:00:00.000Z");

  for (let i = 0; i < 5000; i++) {
    const conv = conversationRow({
      id: `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      address: `54911${String(i).padStart(8, "0")}`,
    });
    const ts = new Date(base + i * 1000).toISOString();
    const msg = messageRow({ conversation_id: conv.id, timestamp: ts });
    conversations.set(conv.id, conv);
    messages.set(conv.id, new Map([[msg.id, msg]]));
  }

  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      filter: Filters.ALL,
      searchPattern: "",
    },
    chat: { ...state.chat, conversations, messages },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F10: ChatList is virtualized", () => {
  it("mounts a window of items, not all 5,000", () => {
    render(<ChatList />);

    const items = screen.getAllByTestId("chat-list-item");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(100);
  });

  it("the window starts at the newest conversation", () => {
    render(<ChatList />);

    expect(screen.getAllByTestId("chat-list-item")[0].textContent).toBe(
      `c0000000-0000-4000-8000-${String(4999).padStart(12, "0")}`,
    );
  });
});
