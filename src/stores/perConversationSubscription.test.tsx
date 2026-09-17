import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import useBoundStore from "./useBoundStore";
import { emptyChatState } from "./chatSlice";
import type { MessageRow } from "@/supabase/client";
import { conversationRow, messageRow, ORG_A } from "@/test/factories";

// P6 point 3. ChatListItem, Chat, ItemActions and useCustomerServiceWindow
// each follow one conversation, through the same selector shape this file
// exercises: `state.chat.messages.get(convId)`. An event on another
// conversation must not re-render them.
//
// They already did not, before P6 touched anything: the point was already
// satisfied and nothing here was red. What this file adds is the guard, so
// that a future change to how pushMessages keeps its Maps cannot quietly
// turn every event into a re-render of every open conversation.

const CONV_A = "c0000000-0000-4000-8000-00000000000a";
const CONV_B = "c0000000-0000-4000-8000-00000000000b";

/** What the four per-conversation subscribers select, and their render count. */
const renders = new Map<string, number>();

function Subscriber({ convId }: { convId: string }) {
  const rows = useBoundStore((state) => state.chat.messages.get(convId));
  renders.set(convId, (renders.get(convId) ?? 0) + 1);
  return (
    <div data-testid={convId}>
      {[...(rows?.values() ?? [])].map((m) => m.id).join(",")}
    </div>
  );
}

function seed() {
  const conversations = new Map(
    [CONV_A, CONV_B].map((id) => [id, conversationRow({ id })]),
  );
  const messages = new Map(
    [CONV_A, CONV_B].map((id) => {
      const row = messageRow({
        conversation_id: id,
        timestamp: "2026-09-01T10:00:00.000Z",
      });
      return [id, new Map([[row.id, row]])] as const;
    }),
  );

  useBoundStore.setState((state) => ({
    ui: { ...state.ui, activeOrgId: ORG_A },
    chat: {
      ...state.chat,
      ...emptyChatState(),
      conversations,
      messages,
      convOrder: [CONV_A, CONV_B],
    },
  }));
}

/** A realtime event reaches the store outside React's own event loop. */
function push(rows: MessageRow[]) {
  act(() => {
    useBoundStore.getState().chat.pushMessages(rows);
  });
}

beforeEach(() => {
  renders.clear();
  seed();
});

describe("a subscriber follows its own conversation", () => {
  it("a message in one conversation does not re-render the other's subscriber", () => {
    render(
      <>
        <Subscriber convId={CONV_A} />
        <Subscriber convId={CONV_B} />
      </>,
    );
    const before = { a: renders.get(CONV_A)!, b: renders.get(CONV_B)! };

    push([
      messageRow({
        id: "d0000000-0000-4000-8000-0000000000a2",
        conversation_id: CONV_A,
        timestamp: "2026-09-01T11:00:00.000Z",
      }),
    ]);

    expect(renders.get(CONV_A)).toBe(before.a + 1);
    expect(renders.get(CONV_B)).toBe(before.b);
    expect(screen.getByTestId(CONV_A).textContent).toContain("0000000000a2");
  });

  it("a status update on one conversation leaves the other's subscriber alone", () => {
    render(
      <>
        <Subscriber convId={CONV_A} />
        <Subscriber convId={CONV_B} />
      </>,
    );
    const before = { a: renders.get(CONV_A)!, b: renders.get(CONV_B)! };

    const newest = [
      ...useBoundStore.getState().chat.messages.get(CONV_A)!.values(),
    ][0];
    push([
      {
        ...newest,
        status: { ...newest.status, read: "2026-09-01T12:00:00.000Z" },
        updated_at: "2026-09-01T12:00:00.000Z",
      },
    ]);

    expect(renders.get(CONV_A)).toBe(before.a + 1);
    expect(renders.get(CONV_B)).toBe(before.b);
  });

  it("the untouched conversation keeps the very same rows object", () => {
    const rowsOfB = useBoundStore.getState().chat.messages.get(CONV_B);

    push([
      messageRow({
        id: "d0000000-0000-4000-8000-0000000000a3",
        conversation_id: CONV_A,
        timestamp: "2026-09-01T11:30:00.000Z",
      }),
    ]);

    expect(useBoundStore.getState().chat.messages.get(CONV_B)).toBe(rowsOfB);
  });
});
