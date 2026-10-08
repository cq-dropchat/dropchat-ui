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
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import {
  useContactAddress,
  useContactsAddresses,
} from "./useContactsAddresses";
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

describe("contact names are batched for mounted rows", () => {
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
    expect(requests[0].searchParams.get("or")).toContain(
      "organization_address.eq",
    );
    expect(requests[0].searchParams.get("limit")).toBe("50");
  });

  it("an address that is not in the book resolves to null with a bounded lookup", async () => {
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
    expect(requests[0].searchParams.get("or")).toContain(
      "organization_address.eq",
    );
    expect(requests[0].searchParams.get("limit")).toBe("50");
  });
});

describe("F10: QueryClient defaults", () => {
  it("keeps data fresh for a minute and does not refetch on focus", () => {
    const defaults = createQueryClient().getDefaultOptions().queries!;
    expect(defaults.staleTime).toBe(60_000);
    expect(defaults.refetchOnWindowFocus).toBe(false);
  });
});

it("only transfers the requested contacts from a 100,000-contact directory, scoped by connection", async () => {
  const extraConnection = "second-connection";
  const book = Array.from({ length: 100000 }, (_, i) => ({
    ...rows[0],
    address: i < 2 ? rows[0].address : `book-${i}`,
    organization_address: i === 1 ? extraConnection : WA_A,
    extra: { name: i === 1 ? "Second connection" : "First connection" },
  }));
  server.use(
    http.get(
      "http://127.0.0.1:54321/rest/v1/contacts_addresses",
      ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const or = url.searchParams.get("or")!;
        expect(url.searchParams.get("organization_id")).toBe(`eq.${ORG_A}`);
        return HttpResponse.json(
          book.filter(
            (row) =>
              or.includes(
                `organization_address.eq."${row.organization_address}"`,
              ) && or.includes(`address.eq."${row.address}"`),
          ),
        );
      },
    ),
  );
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const first = renderHook(
    () => useContactAddress(WA_A, "whatsapp", rows[0].address),
    { wrapper },
  );
  const second = renderHook(
    () => useContactAddress(extraConnection, "whatsapp", rows[0].address),
    { wrapper },
  );
  await waitFor(() =>
    expect(first.result.current.data?.extra?.name).toBe("First connection"),
  );
  await waitFor(() =>
    expect(second.result.current.data?.extra?.name).toBe("Second connection"),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get("or")).toContain(rows[0].address);
  expect(requests[0].searchParams.has("offset")).toBe(false);
});

it("pages the directory by its complete primary key and sends search to the server", async () => {
  const book = Array.from({ length: 201 }, (_, i) => ({
    ...rows[0],
    address: `contact-${String(i).padStart(4, "0")}`,
  }));
  server.use(
    http.get(
      "http://127.0.0.1:54321/rest/v1/contacts_addresses",
      ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const filters = url.searchParams.getAll("or").join(",");
        const match = filters.match(/(?:^|[,(])address\.gt\."([^"]+)"/);
        expect(url.searchParams.get("order")).toBe(
          "organization_address.asc,service.asc,address.asc",
        );
        expect(url.searchParams.get("limit")).toBe("100");
        expect(url.searchParams.has("offset")).toBe(false);
        return HttpResponse.json(
          book.filter((row) => !match || row.address > match[1]).slice(0, 100),
        );
      },
    ),
  );
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useContactsAddresses("Contact"), {
    wrapper,
  });
  await waitFor(() => expect(result.current.data).toHaveLength(100));
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.data).toHaveLength(200));
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.data).toHaveLength(201));
  expect(result.current.hasNextPage).toBe(false);
  expect(new Set(result.current.data?.map((row) => row.address)).size).toBe(
    201,
  );
  expect(requests[1].searchParams.getAll("or").join(",")).toContain(
    'address.gt."contact-0099"',
  );
  expect(requests[0].searchParams.get("or")).toContain(
    "extra->synced->>name.ilike",
  );
});
