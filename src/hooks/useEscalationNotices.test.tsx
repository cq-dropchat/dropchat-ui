// H5 — a handover nobody sees is worse than no handover at all.
//
// When an agent hands a conversation to a person (H3), the row's
// `awaiting_human_since` is set and the change travels by Realtime like any
// other. That is enough for a screen that happens to be looking at the list,
// and not enough for anything else: the tab is usually in the background.
//
// So: a browser notification (permission asked once, never on load), a count
// in the tab's title, and nothing at all for the conversation already open on
// screen — the person is looking at it.
import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useBoundStore from "@/stores/useBoundStore";
import { emptyChatState } from "@/stores/chatSlice";
import { conversationRow, ORG_A } from "@/test/factories";
import { useEscalationNotices } from "./useEscalationNotices";

// The member's own agent row, where the preference lives, comes from a query.
const currentAgent = vi.hoisted(() => ({
  value: { extra: { notifications: { escalation: true } } },
}));

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: currentAgent.value }),
}));

const NOW = "2026-09-20T12:00:00.000Z";

type NotificationMock = ReturnType<typeof stubNotification>;

/** The browser API, as jsdom does not have it. */
function stubNotification(permission: NotificationPermission = "default") {
  const shown: { title: string; body?: string }[] = [];
  const requests: number[] = [];
  let current = permission;

  class FakeNotification {
    static get permission() {
      return current;
    }
    static requestPermission() {
      requests.push(1);
      current = "granted";
      return Promise.resolve<NotificationPermission>("granted");
    }
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, body: options?.body });
    }
    close() {}
    onclick: (() => void) | null = null;
  }

  vi.stubGlobal("Notification", FakeNotification);

  return { shown, requests, grant: () => (current = "granted") };
}

function escalate(id: string, since: string | null = NOW) {
  act(() => {
    useBoundStore.getState().chat.pushConversations([
      conversationRow({
        id,
        organization_id: ORG_A,
        name: "Carla",
        awaiting_human_since: since,
        updated_at: since ?? NOW,
      }),
    ]);
  });
}

function signIn({
  escalationNotices = true,
}: { escalationNotices?: boolean } = {}) {
  currentAgent.value = {
    extra: { notifications: { escalation: escalationNotices } },
  };

  act(() => {
    useBoundStore.setState((state) => ({
      ui: {
        ...state.ui,
        activeOrgId: ORG_A,
        activeConvId: null,
        user: { id: "user-a" } as never,
      },
      chat: { ...state.chat, ...emptyChatState() },
    }));
  });
}

describe("H5: escalation notices", () => {
  let notification: NotificationMock;

  beforeEach(() => {
    notification = stubNotification();
    document.title = "DropChat";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notifies once when a conversation starts waiting for a person", async () => {
    signIn();
    const { result } = renderHook(() => useEscalationNotices());

    escalate("conv-1");

    await waitFor(() => expect(notification.shown).toHaveLength(1));
    expect(notification.shown[0].title).toContain("Carla");
    expect(result.current.waitingCount).toBe(1);

    // The same row arriving again (a later update of the same conversation)
    // is not a new handover.
    escalate("conv-1");

    expect(notification.shown).toHaveLength(1);
  });

  it("asks for permission once, and only when there is something to say", async () => {
    signIn();
    renderHook(() => useEscalationNotices());

    expect(notification.requests).toHaveLength(0);

    escalate("conv-1");
    escalate("conv-2");

    await waitFor(() => expect(notification.shown).toHaveLength(2));
    expect(notification.requests).toHaveLength(1);
  });

  it("counts the conversations waiting in the tab title, and gives it back", async () => {
    signIn();
    renderHook(() => useEscalationNotices());

    escalate("conv-1");
    escalate("conv-2");

    await waitFor(() => expect(document.title).toBe("(2) DropChat"));

    // Somebody took one of them: the count follows the rows, not the notices.
    escalate("conv-1", null);

    await waitFor(() => expect(document.title).toBe("(1) DropChat"));

    escalate("conv-2", null);

    await waitFor(() => expect(document.title).toBe("DropChat"));
  });

  it("says nothing about the conversation already open on screen", async () => {
    signIn();
    act(() => {
      useBoundStore.setState((state) => ({
        ui: { ...state.ui, activeConvId: "conv-1" },
      }));
    });

    renderHook(() => useEscalationNotices());

    escalate("conv-1");

    await waitFor(() => expect(document.title).toBe("(1) DropChat"));
    expect(notification.shown).toHaveLength(0);
  });

  it("respects the member's preference", async () => {
    signIn({ escalationNotices: false });
    renderHook(() => useEscalationNotices());

    escalate("conv-1");

    // The count is still theirs to see — the interruption is what they
    // turned off.
    await waitFor(() => expect(document.title).toBe("(1) DropChat"));
    expect(notification.shown).toHaveLength(0);
    expect(notification.requests).toHaveLength(0);
  });
});
