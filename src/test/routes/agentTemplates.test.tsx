// T7 — «Agregar agente»: en blanco, o desde una plantilla.
//
// The acceptance criterion of this item is D12 at its most demanding: you can
// create an agent that WORKS without touching a single technical field. Not
// "the technical fields are hidden behind a section" — not present at all in
// the path a shop owner takes.
//
// So the last case here is the whole item: walk the install flow and assert
// that nothing on the way asked for a model, a protocol, a URL, a temperature
// or an API key.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
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
import type { ComponentType, ReactNode } from "react";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A } from "@/test/factories";

const role = { value: "admin" };
const navigate = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
  }),
  useNavigate: () => navigate,
  useRouter: () => ({ history: { back: vi.fn(), canGoBack: () => false } }),
  useLocation: () => ({ pathname: "/agents/new", hash: "" }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/queries/useAgents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/queries/useAgents")>()),
  useCurrentAgent: () => ({ data: { id: "agent-self", role: role.value } }),
}));

const TEMPLATES = [
  {
    id: "11111111-0000-4000-8000-000000000001",
    slug: "ventas-contra-entrega",
    name: "Ventas contra entrega",
    description: "Toma pedidos y confirma la dirección de despacho.",
    category: "ventas",
    source_agent_id: null,
    archived_at: null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
    agent_template_versions: [
      {
        template_id: "11111111-0000-4000-8000-000000000001",
        version: 1,
        config: {},
        config_hash: "h1",
        changelog: "primera",
        published_by: null,
        published_at: "2026-09-21T00:00:00.000Z",
        retired_at: null,
      },
      {
        template_id: "11111111-0000-4000-8000-000000000001",
        version: 2,
        config: {},
        config_hash: "h2",
        changelog: "segunda",
        published_by: null,
        published_at: "2026-09-21T01:00:00.000Z",
        retired_at: null,
      },
    ],
  },
  {
    id: "11111111-0000-4000-8000-000000000002",
    slug: "postventa",
    name: "Postventa",
    description: "Responde por cambios, devoluciones y seguimiento.",
    category: "soporte",
    source_agent_id: null,
    archived_at: null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
    // Every version retired: nothing to install, so it is not offered.
    agent_template_versions: [
      {
        template_id: "11111111-0000-4000-8000-000000000002",
        version: 1,
        config: {},
        config_hash: "h3",
        changelog: null,
        published_by: null,
        published_at: "2026-09-21T00:00:00.000Z",
        retired_at: "2026-09-21T02:00:00.000Z",
      },
    ],
  },
];

const installed: { body: Record<string, unknown> | null } = { body: null };

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
    HttpResponse.json(TEMPLATES),
  ),
  http.get("http://127.0.0.1:54321/rest/v1/model_tiers", () =>
    HttpResponse.json([]),
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/install_agent_template",
    async ({ request }) => {
      installed.body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json({
        id: "a0000000-0000-4000-8000-000000000009",
        name: "Ventas contra entrega",
      });
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  installed.body = null;
  navigate.mockClear();
  role.value = "admin";
});
afterAll(() => server.close());

beforeEach(() => {
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      language: "es",
      user: { id: "user-a" } as never,
    },
  }));
});

async function renderPage() {
  const module = await import("@/routes/_auth/agents/new");
  const Page = (
    module.Route as unknown as { options: { component: ComponentType } }
  ).options.component;

  render(
    <QueryClientProvider client={createQueryClient()}>
      <Page />
    </QueryClientProvider>,
  );

  await screen.findByText("Desde una plantilla");
}

describe("T7: creating an agent", () => {
  it("asks first where the agent comes from", async () => {
    await renderPage();

    expect(screen.getByText("En blanco")).toBeVisible();
    // The blank form is not on the page until somebody asks for it.
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });

  it("offers the templates that have something installable", async () => {
    await renderPage();

    await userEvent.click(screen.getByText("Desde una plantilla"));

    expect(await screen.findByText("Ventas contra entrega")).toBeVisible();
    expect(
      screen.getByText("Toma pedidos y confirma la dirección de despacho."),
    ).toBeVisible();

    // Every version of this one was retired: installing it would produce an
    // agent pointing at nothing.
    expect(screen.queryByText("Postventa")).toBeNull();
  });

  it("installs the newest version that is not retired", async () => {
    await renderPage();

    await userEvent.click(screen.getByText("Desde una plantilla"));
    await userEvent.click(await screen.findByText("Ventas contra entrega"));

    await waitFor(() => expect(installed.body).not.toBeNull());

    expect(installed.body).toMatchObject({
      _organization_id: ORG_A,
      _template_id: "11111111-0000-4000-8000-000000000001",
      _version: 2,
    });

    // And it opens the agent it just created, which is where the badge and
    // the read-only instructions live.
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/agents/a0000000-0000-4000-8000-000000000009",
        }),
      ),
    );
  });

  it("says so when there is no catalogue yet", async () => {
    server.use(
      http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
        HttpResponse.json([]),
      ),
    );

    await renderPage();
    await userEvent.click(screen.getByText("Desde una plantilla"));

    expect(await screen.findByText(/Todavía no hay plantillas/)).toBeVisible();
  });

  // The item's acceptance criterion, as a walk of the path.
  it("asks for no technical field anywhere on the way", async () => {
    await renderPage();

    await userEvent.click(screen.getByText("Desde una plantilla"));
    await screen.findByText("Ventas contra entrega");

    const text = document.body.textContent ?? "";

    for (const word of [
      "Proveedor",
      "Protocolo",
      "API URL",
      "Temperatura",
      "Clave API",
      "chat_completions",
    ]) {
      expect(text).not.toContain(word);
    }
  });
});
