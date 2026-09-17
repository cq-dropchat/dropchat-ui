import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { useAgentProfile, useCurrentAgents } from "./useAgents";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A } from "@/test/factories";

// F23 — the agents list (loaded on every screen by _auth, ChatListItem,
// ConnectionOwner) and every message author's avatar selected whole rows: an
// AI agent's `extra` carries its instructions and tool configurations, tens
// of KB each, to show a name, a picture and a mode.

const ROBOT = "aaaaaaaa-0000-4000-8000-00000000a0a9";
let selects: string[] = [];
let queries: URL[] = [];

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/agents", ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get("select") ?? "";
    selects.push(select);
    queries.push(url);
    const row = {
      id: ROBOT,
      organization_id: ORG_A,
      user_id: null,
      name: "Robot A",
      picture: null,
      role: "member",
      created_at: "2026-09-01T10:00:00.000Z",
      mode: "active",
      ...(select === "*" || select.split(",").includes("extra")
        ? {
            extra: {
              mode: "active",
              instructions: "x".repeat(20_000),
              tools: [],
            },
          }
        : {}),
    };
    return url.searchParams.get("id")
      ? HttpResponse.json(row)
      : HttpResponse.json([row]);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  selects = [];
  queries = [];
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      user: { id: "user-a" } as typeof state.ui.user,
    },
  }));
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function selectsExtra(select: string) {
  return select === "*" || /(^|,)extra(,|$)/.test(select);
}

describe("F23: agent lists and avatars do not fetch extra", () => {
  it("the organization's agents list projects the mode, not extra", async () => {
    const { result } = renderHook(() => useCurrentAgents(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(selects).toHaveLength(1);
    expect(selectsExtra(selects[0])).toBe(false);
    expect(result.current.data?.[0]).toMatchObject({
      id: ROBOT,
      name: "Robot A",
      user_id: null,
      mode: "active",
    });
  });

  it("a message author's avatar reads its id, name and picture", async () => {
    const { result } = renderHook(() => useAgentProfile(ROBOT), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(selects).toEqual(["id,name,picture"]);
    expect(result.current.data?.name).toBe("Robot A");
  });
});

// P8 — a retired agent is a soft delete, and the SELECT policy keeps the row
// readable on purpose: a message it wrote still has to say who wrote it, and a
// local roster still has to name everyone in it. Which means the filtering is
// the reader's job, and a list that forgets it offers a former colleague as if
// they were still there.
describe("P8: retired agents stay out of the lists", () => {
  it("the organization's agents list asks for the live ones only", async () => {
    const { result } = renderHook(() => useCurrentAgents(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(queries[0].searchParams.get("deleted_at")).toBe("is.null");
  });

  it("but an author's profile does not: that is the row it exists for", async () => {
    const { result } = renderHook(() => useAgentProfile(ROBOT), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(queries[0].searchParams.get("deleted_at")).toBeNull();
  });
});
