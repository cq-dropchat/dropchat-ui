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
import { useContactAddress } from "./useContactsAddresses";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A, WA_A } from "@/test/factories";

// F10 — every ChatListItem called useContactAddress, one PostgREST request
// per conversation, refetched on every window focus (QueryClient had no
// defaults). With 5,000 conversations, focusing the tab sent 5,000 requests.

const rows = Array.from({ length: 50 }, (_, i) => ({
  organization_id: ORG_A,
  organization_address: WA_A,
  service: "whatsapp",
  address: `54911000${String(i).padStart(5, "0")}`,
  extra: { name: `Contacto ${i}` },
  status: "active",
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
}));

let requests: URL[] = [];

const server = setupServer(
  http.get(
    "http://127.0.0.1:54321/rest/v1/contacts_addresses",
    ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      // Single-row lookups (the old N+1) answer with the matching row.
      const address = url.searchParams.get("address")?.replace(/^eq\./, "");
      if (address) {
        const row = rows.find((r) => r.address === address);
        return HttpResponse.json(row ?? null);
      }
      return HttpResponse.json(rows);
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  requests = [];
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      user: { id: "user-1" } as typeof state.ui.user,
    },
  }));
});

describe("F10: contact names come from one cached list", () => {
  it("50 list items resolve their contact with a single request", async () => {
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const hooks = rows.map((row) =>
      renderHook(() => useContactAddress(WA_A, "whatsapp", row.address), {
        wrapper,
      }),
    );

    await waitFor(() => {
      for (const [i, hook] of hooks.entries()) {
        expect(hook.result.current.data?.address).toBe(rows[i].address);
      }
    });

    expect(requests).toHaveLength(1);
  });

  it("an address that is not in the book resolves to null without a request of its own", async () => {
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useContactAddress(WA_A, "whatsapp", "5491199999999"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(requests).toHaveLength(1);
  });
});

describe("F10: QueryClient defaults", () => {
  it("keeps data fresh for a minute and does not refetch on focus", () => {
    const defaults = createQueryClient().getDefaultOptions().queries!;
    expect(defaults.staleTime).toBe(60_000);
    expect(defaults.refetchOnWindowFocus).toBe(false);
  });
});
