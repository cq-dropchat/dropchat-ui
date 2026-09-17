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
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ComponentType, ReactNode } from "react";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A } from "@/test/factories";

// P4 (F18) — the organization export was API-only: an owner could file one
// with `rpc/request_organization_export` and sign a URL for the ZIP, but the
// product had no way in. This is that way in, and it is the owner's alone —
// the RPC answers 42501 to anyone else, so showing them the button would be
// showing them an error.

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
  }),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/settings/organization", hash: "" }),
  useRouter: () => ({ history: { back: vi.fn(), canGoBack: () => false } }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

let role = "owner";
vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { id: "agent-self", role } }),
}));

const EXPORT_ID = "eeeeeeee-0000-4000-8000-00000000e001";
const OBJECT = `organizations/${ORG_A}/exports/${EXPORT_ID}.zip`;

/** The newest export row the screen reads, or none at all. */
let exportRow: Record<string, unknown> | null = null;
const requested = vi.fn();
const signed = vi.fn();

/** jsdom has no window.open; the download is "we opened the signed URL". */
const opened = vi.fn();
vi.stubGlobal("open", opened);

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/organizations", () =>
    HttpResponse.json({
      id: ORG_A,
      name: "Alpha",
      extra: {},
      created_at: "2026-09-01T10:00:00.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
    }),
  ),
  http.get("http://127.0.0.1:54321/rest/v1/organization_exports", () =>
    HttpResponse.json(exportRow ? [exportRow] : []),
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/request_organization_export",
    async ({ request }) => {
      requested(await request.json());
      exportRow = {
        id: EXPORT_ID,
        organization_id: ORG_A,
        status: "pending",
        object_name: null,
        error: null,
        expires_at: null,
        requested_at: "2026-09-17T12:00:00.000Z",
        started_at: null,
        completed_at: null,
        requested_by: null,
      };
      return HttpResponse.json(EXPORT_ID);
    },
  ),
  http.post(
    `http://127.0.0.1:54321/storage/v1/object/sign/exports/${OBJECT}`,
    async ({ request }) => {
      signed(await request.json());
      return HttpResponse.json({
        signedURL: `/object/sign/exports/${OBJECT}?token=t`,
      });
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  role = "owner";
  exportRow = null;
  requested.mockReset();
  signed.mockReset();
  opened.mockReset();
  navigate.mockReset();
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      language: "es",
      // The organization query waits for a signed-in user; only its id is read.
      user: { id: "u1" } as unknown as NonNullable<typeof state.ui.user>,
    },
  }));
});

async function renderPage() {
  const { Route } = await import("@/routes/_auth/settings/organization/index");
  const Page = (Route as unknown as { options: { component: ComponentType } })
    .options.component;
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
  await screen.findByDisplayValue("Alpha");
}

describe("P4: organization export on the organization screen", () => {
  it("an owner files an export and sees it pending", async () => {
    await renderPage();

    const button = await screen.findByRole("button", {
      name: "Exportar datos",
    });
    button.click();

    await waitFor(() =>
      expect(requested).toHaveBeenCalledWith({ _organization_id: ORG_A }),
    );
    expect(await screen.findByText("Preparando…")).toBeInTheDocument();
  });

  it("a ready export offers a download and says when it expires", async () => {
    exportRow = {
      id: EXPORT_ID,
      organization_id: ORG_A,
      status: "ready",
      object_name: OBJECT,
      error: null,
      expires_at: "2026-09-24T12:00:00.000Z",
      requested_at: "2026-09-17T12:00:00.000Z",
      started_at: "2026-09-17T12:00:05.000Z",
      completed_at: "2026-09-17T12:00:30.000Z",
      requested_by: null,
    };
    await renderPage();

    const download = await screen.findByRole("button", { name: "Descargar" });
    expect(
      screen.getByText(
        new RegExp(new Date("2026-09-24T12:00:00.000Z").toLocaleDateString()),
      ),
    ).toBeInTheDocument();

    download.click();
    await waitFor(() => expect(signed).toHaveBeenCalled());
    await waitFor(() =>
      expect(opened).toHaveBeenCalledWith(
        expect.stringContaining(`/object/sign/exports/${OBJECT}`),
        "_blank",
        "noopener",
      ),
    );
  });

  it("a failed export shows its reason and lets the owner try again", async () => {
    exportRow = {
      id: EXPORT_ID,
      organization_id: ORG_A,
      status: "failed",
      object_name: null,
      error: "out of memory",
      expires_at: null,
      requested_at: "2026-09-17T12:00:00.000Z",
      started_at: "2026-09-17T12:00:05.000Z",
      completed_at: "2026-09-17T12:00:30.000Z",
      requested_by: null,
    };
    await renderPage();

    expect(await screen.findByText(/out of memory/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exportar datos" }),
    ).toBeEnabled();
  });

  it("a member does not see the action at all", async () => {
    role = "member";
    exportRow = {
      id: EXPORT_ID,
      organization_id: ORG_A,
      status: "ready",
      object_name: OBJECT,
      error: null,
      expires_at: "2026-09-24T12:00:00.000Z",
      requested_at: "2026-09-17T12:00:00.000Z",
      started_at: null,
      completed_at: null,
      requested_by: null,
    };
    await renderPage();

    expect(screen.queryByRole("button", { name: "Exportar datos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar" })).toBeNull();
  });
});
