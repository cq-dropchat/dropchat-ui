import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import useBoundStore from "./useBoundStore";
import { conversationRow, messageRow, ORG_A, ORG_B } from "@/test/factories";

// F20 — the chat slice outlived the session. Changing organization, signing
// out, or another user signing in on the same tab left the previous
// organization's conversations, messages, drafts and membership state in
// memory; ChatList only hid them by organization_id. And a late response or
// Realtime event for the previous organization landed in the new one's store.

function user(id: string) {
  return { id } as User;
}

function seedOrgA() {
  const conv = conversationRow({ organization_id: ORG_A });
  const msg = messageRow({ organization_id: ORG_A, conversation_id: conv.id });
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      user: user("user-a"),
      activeOrgId: ORG_A,
      activeConvId: conv.id,
      templateDrafts: new Map([[conv.id, {} as never]]),
    },
    chat: {
      ...state.chat,
      ownAgentId: "agent-a",
      conversations: new Map([[conv.id, conv]]),
      messages: new Map([[conv.id, new Map([[msg.id, msg]])]]),
      membershipExtras: new Map([[conv.id, { pinned: "2026-09-01" }]]),
      textDrafts: new Map([[conv.id, "borrador de A"]]),
      fileDrafts: new Map([[conv.id, []]]),
      mediaLoads: new Map([[msg.id, {} as never]]),
    },
  }));
  return { conv, msg };
}

function expectEmptyChat() {
  const { chat, ui } = useBoundStore.getState();
  expect(chat.conversations.size).toBe(0);
  expect(chat.messages.size).toBe(0);
  expect(chat.membershipExtras.size).toBe(0);
  expect(chat.textDrafts.size).toBe(0);
  expect(chat.fileDrafts.size).toBe(0);
  expect(chat.mediaLoads.size).toBe(0);
  expect(chat.ownAgentId).toBeNull();
  expect(ui.activeConvId).toBeNull();
  expect(ui.templateDrafts.size).toBe(0);
}

beforeEach(() => {
  seedOrgA();
});

describe("F20: the chat slice belongs to one organization and one user", () => {
  it("switching organization empties it", () => {
    useBoundStore.getState().ui.setActiveOrg(ORG_B);

    expectEmptyChat();
    expect(useBoundStore.getState().ui.activeOrgId).toBe(ORG_B);
  });

  it("re-selecting the same organization keeps it", () => {
    useBoundStore.getState().ui.setActiveOrg(ORG_A);

    expect(useBoundStore.getState().chat.messages.size).toBe(1);
    expect(useBoundStore.getState().ui.activeConvId).not.toBeNull();
  });

  it("signing out empties it", () => {
    useBoundStore.getState().ui.setUser(null);

    expectEmptyChat();
  });

  it("another user signing in on the same tab empties it", () => {
    useBoundStore.getState().ui.setUser(user("user-b"));

    expectEmptyChat();
  });

  it("the same user's session refresh (SIGNED_IN on tab focus) keeps it", () => {
    useBoundStore.getState().ui.setUser(user("user-a"));

    expect(useBoundStore.getState().chat.messages.size).toBe(1);
  });

  it("rows of another organization arriving late are dropped", () => {
    useBoundStore.getState().ui.setActiveOrg(ORG_B);

    const lateConv = conversationRow({ organization_id: ORG_A });
    const lateMsg = messageRow({
      organization_id: ORG_A,
      conversation_id: lateConv.id,
    });
    useBoundStore.getState().chat.pushConversations([lateConv]);
    useBoundStore.getState().chat.pushMessages([lateMsg]);

    expect(useBoundStore.getState().chat.conversations.size).toBe(0);
    expect(useBoundStore.getState().chat.messages.size).toBe(0);

    const own = messageRow({ organization_id: ORG_B });
    useBoundStore.getState().chat.pushMessages([own]);
    expect(useBoundStore.getState().chat.messages.size).toBe(1);
  });

  it("nothing lands after signing out", () => {
    useBoundStore.getState().ui.setUser(null);
    useBoundStore.getState().ui.setActiveOrg(null);

    useBoundStore
      .getState()
      .chat.pushMessages([messageRow({ organization_id: ORG_A })]);

    expect(useBoundStore.getState().chat.messages.size).toBe(0);
  });
});
