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
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useInitialDataFetch } from "./useInitalDataFetch";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A, ORG_B } from "@/test/factories";

// F20 — membership state (the caller's agent id and per-conversation
// extras) carries no organization_id the store could check. A response for
// organization A that arrived after the switch to B set A's agent id and
// pins in B's session.

const REST = "http://127.0.0.1:54321/rest/v1";
let agentRequests: string[] = [];

const server = setupServer(
  http.post(`${REST}/rpc/init_data`, () =>
    HttpResponse.json({ conversations: [], messages: [] }),
  ),
  http.get(`${REST}/agents`, async ({ request }) => {
    const org = new URL(request.url).searchParams.get("organization_id");
    agentRequests.push(org ?? "");
    if (org === `eq.${ORG_A}`) {
      await delay(150); // slow: the user switches organization meanwhile
      return HttpResponse.json([{ id: "agent-in-org-a" }]);
    }
    return HttpResponse.json([]); // not a member of B
  }),
  http.get(`${REST}/conversations_agents`, () =>
    HttpResponse.json([
      { conversation_id: "c-in-org-a", extra: { pinned: "2026-09-01" } },
    ]),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  agentRequests = [];
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      user: { id: "user-1" } as typeof state.ui.user,
    },
    chat: {
      ...state.chat,
      ownAgentId: null,
      membershipExtras: new Map(),
    },
  }));
});

describe("F20: a late membership response of the previous organization", () => {
  it("does not land in the new organization's session", async () => {
    renderHook(() => useInitialDataFetch());

    await waitFor(() => expect(agentRequests).toContain(`eq.${ORG_A}`));
    act(() => useBoundStore.getState().ui.setActiveOrg(ORG_B));
    await waitFor(() => expect(agentRequests).toContain(`eq.${ORG_B}`));

    // Let A's slow response arrive.
    await act(() => new Promise((r) => setTimeout(r, 300)));

    const { chat } = useBoundStore.getState();
    expect(chat.ownAgentId).toBeNull();
    expect(chat.membershipExtras.size).toBe(0);
  });
});
