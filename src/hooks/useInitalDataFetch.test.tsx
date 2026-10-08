import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useInitialDataFetch } from "./useInitalDataFetch";
import useBoundStore from "@/stores/useBoundStore";
import { conversationRow, messageRow, ORG_A, ORG_B } from "@/test/factories";
const endpoint = "http://127.0.0.1:54321/rest/v1";
const server = setupServer(
  http.get(`${endpoint}/agents`, () => HttpResponse.json(null)),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  useBoundStore.getState().ui.setActiveOrg(ORG_A);
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeConvId: null,
      user: { id: "user" } as typeof state.ui.user,
    },
  }));
});
describe("scoped initial window", () => {
  it("uses a single preview window even when all timestamps tie", async () => {
    let requests = 0;
    server.use(
      http.post(`${endpoint}/rpc/init_data`, async ({ request }) => {
        requests++;
        expect(await request.json()).toMatchObject({
          p_limit: 300,
          p_per_conversation: 10,
          p_organization_id: ORG_A,
        });
        return HttpResponse.json({
          conversations: [conversationRow({ id: "chat" })],
          messages: Array.from({ length: 300 }, () =>
            messageRow({ conversation_id: "chat" }),
          ),
        });
      }),
    );
    renderHook(useInitialDataFetch);
    await waitFor(() =>
      expect(useBoundStore.getState().chat.conversations.has("chat")).toBe(
        true,
      ),
    );
    expect(requests).toBe(1);
  });
  it("aborts an old tenant request and recovers the current tenant on visibility", async () => {
    const organizations: string[] = [];
    let aborted = false;
    server.use(
      http.post(`${endpoint}/rpc/init_data`, async ({ request }) => {
        const { p_organization_id } = (await request.json()) as {
          p_organization_id: string;
        };
        organizations.push(p_organization_id);
        if (p_organization_id === ORG_A) {
          request.signal.addEventListener("abort", () => {
            aborted = true;
          });
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
        return HttpResponse.json({
          conversations: [
            conversationRow({
              id: p_organization_id,
              organization_id: p_organization_id,
            }),
          ],
          messages: [],
        });
      }),
    );
    renderHook(useInitialDataFetch);
    await waitFor(() => expect(organizations).toContain(ORG_A));
    act(() => useBoundStore.getState().ui.setActiveOrg(ORG_B));
    await waitFor(() =>
      expect(useBoundStore.getState().chat.conversations.has(ORG_B)).toBe(true),
    );
    await waitFor(() => expect(aborted).toBe(true));
    expect(useBoundStore.getState().chat.conversations.has(ORG_A)).toBe(false);
    const recoveryOrgs: string[] = [];
    server.use(
      http.get(`${endpoint}/conversations`, ({ request }) => {
        recoveryOrgs.push(
          new URL(request.url).searchParams.get("organization_id")!,
        );
        return HttpResponse.json([]);
      }),
      http.get(`${endpoint}/messages`, () => HttpResponse.json([])),
    );
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(recoveryOrgs).toEqual([`eq.${ORG_B}`]));
  });
});
