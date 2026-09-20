// H6 — the header's answer to "who is attending this?".
//
// Before the Fase H there was nothing to answer with: every external
// conversation was answered by whichever agent the backend picked that
// minute. Now the row says, and a person has to be able to see it and change
// it without leaving the chat — including the case that matters most, a
// conversation waiting for somebody to take it.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import ConversationAssignment from "./ConversationAssignment";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { AGENT_ALICE, conversationRow, ORG_A } from "@/test/factories";
import type { ConversationRow } from "@/supabase/client";

const ROBOT = "aaaaaaaa-0000-4000-8000-00000000a0a9";
const DRAFT_ROBOT = "aaaaaaaa-0000-4000-8000-00000000a0d1";

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgents: () => ({
    data: [
      { id: AGENT_ALICE, name: "Alice", user_id: "user-a", mode: null },
      { id: ROBOT, name: "Sofía", user_id: null, mode: "active" },
      { id: DRAFT_ROBOT, name: "Borrador", user_id: null, mode: "draft" },
    ],
  }),
  useCurrentAgent: () => ({ data: { id: AGENT_ALICE, name: "Alice" } }),
}));

const assigned: { body: unknown } = { body: null };

const server = setupServer(
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/assign_conversation",
    async ({ request }) => {
      assigned.body = await request.json();

      return HttpResponse.json(null);
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  assigned.body = null;
});
afterAll(() => server.close());

function show(conversation: Partial<ConversationRow>) {
  useBoundStore.setState((state) => ({
    ui: { ...state.ui, activeOrgId: ORG_A, language: "es" },
  }));

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ConversationAssignment
        conversation={conversationRow({ id: "conv-1", ...conversation })}
      />
    </QueryClientProvider>,
  );
}

describe("H6: who is attending the conversation", () => {
  it("names the AI that holds it", () => {
    show({ assigned_agent_id: ROBOT });

    expect(screen.getByTestId("assignment-button").textContent).toContain(
      "Sofía",
    );
  });

  it("names the person who holds it", () => {
    show({ assigned_agent_id: AGENT_ALICE });

    expect(screen.getByTestId("assignment-button").textContent).toContain(
      "Alice",
    );
  });

  it("says how long a conversation has been waiting for a person", () => {
    show({
      assigned_agent_id: null,
      awaiting_human_since: new Date(Date.now() - 45 * 60_000).toISOString(),
    });

    const label = screen.getByTestId("assignment-button").textContent ?? "";

    expect(label).toContain("Esperando humano");
    expect(screen.getByTestId("waited").textContent).toContain("45 min");
  });

  it("says when nobody holds it", () => {
    show({ assigned_agent_id: null });

    expect(screen.getByTestId("assignment-button").textContent).toContain(
      "Sin asignar",
    );
  });

  it("takes the conversation through the RPC", async () => {
    show({ assigned_agent_id: ROBOT });

    await userEvent.click(screen.getByTestId("assignment-button"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Tomar/ }));

    await waitFor(() =>
      expect(assigned.body).toEqual({
        p_conversation_id: "conv-1",
        p_agent_id: AGENT_ALICE,
      }),
    );
  });

  it("hands it back to an AI, and never offers a draft one", async () => {
    show({
      assigned_agent_id: null,
      awaiting_human_since: new Date().toISOString(),
    });

    await userEvent.click(screen.getByTestId("assignment-button"));

    // A draft agent does not answer (H1), so handing a conversation to it
    // would be handing it to nobody.
    expect(screen.queryByRole("menuitem", { name: /Borrador/ })).toBeNull();

    await userEvent.click(screen.getByRole("menuitem", { name: /Sofía/ }));

    await waitFor(() =>
      expect(assigned.body).toEqual({
        p_conversation_id: "conv-1",
        p_agent_id: ROBOT,
      }),
    );
  });

  it("stays out of team chat, where the roster names the agent", () => {
    const { container } = show({ service: "local", assigned_agent_id: null });

    expect(container).toBeEmptyDOMElement();
  });
});
