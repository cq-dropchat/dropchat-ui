// T7 — el panel de publicación, que es de la plataforma y no de un inquilino.
//
// Same shape as /errors (E1): not under /settings, not in the menu, reached by
// typing the URL, and RLS is what actually guards it — the check here only
// decides what to draw.
//
// What it is for: until this screen existed, publishing a version meant the
// SQL runbook in backend/README.md, and `publish_agent_template_version` reads
// `auth.uid()`, so it cannot even be called from the SQL editor. A panel is
// not a convenience here; it is the only way to use the function T4 built.
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
import type { ComponentType } from "react";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A } from "@/test/factories";

const mocks = vi.hoisted(() => ({ isPlatformAdmin: vi.fn() }));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
  }),
}));

vi.mock("@/queries/useErrorIssues", () => ({
  useIsPlatformAdmin: mocks.isPlatformAdmin,
}));

const TEMPLATE_ID = "11111111-0000-4000-8000-000000000001";

const TEMPLATES = [
  {
    id: TEMPLATE_ID,
    slug: "ventas-contra-entrega",
    name: "Ventas contra entrega",
    description: "Toma pedidos.",
    category: "ventas",
    source_agent_id: "a0000000-0000-4000-8000-00000000000a",
    archived_at: null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
    agent_template_versions: [
      {
        template_id: TEMPLATE_ID,
        version: 1,
        config: {},
        config_hash: "h1",
        changelog: "primera",
        published_by: null,
        published_at: "2026-09-21T00:00:00.000Z",
        retired_at: null,
      },
    ],
  },
];

const calls: {
  published: unknown;
  promoted: unknown;
  retired: unknown;
  created: unknown;
} = { published: null, promoted: null, retired: null, created: null };

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
    HttpResponse.json(TEMPLATES),
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/agent_templates",
    async ({ request }) => {
      calls.created = await request.json();
      return HttpResponse.json(TEMPLATES[0]);
    },
  ),
  http.get("http://127.0.0.1:54321/rest/v1/platform_settings", () =>
    HttpResponse.json({
      id: true,
      template_org_id: ORG_A,
      updated_at: "2026-09-21T00:00:00.000Z",
    }),
  ),
  http.get("http://127.0.0.1:54321/rest/v1/agents", () =>
    HttpResponse.json([
      { id: "a0000000-0000-4000-8000-00000000000a", name: "Plantillera" },
    ]),
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/publish_agent_template_version",
    async ({ request }) => {
      calls.published = await request.json();
      return HttpResponse.json({ template_id: TEMPLATE_ID, version: 2 });
    },
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/retire_agent_template_version",
    async ({ request }) => {
      calls.retired = await request.json();
      return HttpResponse.json({ template_id: TEMPLATE_ID, version: 1 });
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  calls.published = null;
  calls.promoted = null;
  calls.retired = null;
  calls.created = null;
  mocks.isPlatformAdmin.mockReturnValue({ data: true, isPending: false });
});
afterAll(() => server.close());

beforeEach(() => {
  mocks.isPlatformAdmin.mockReturnValue({ data: true, isPending: false });
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      language: "es",
      user: { id: "user-a" } as never,
    },
  }));
});

async function renderPanel() {
  const module = await import("@/routes/templates");
  const Page = (
    module.Route as unknown as { options: { component: ComponentType } }
  ).options.component;

  render(
    <QueryClientProvider client={createQueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
}

describe("T7: the publishing panel", () => {
  it("shows nothing to somebody who is not a platform admin", async () => {
    mocks.isPlatformAdmin.mockReturnValue({ data: false, isPending: false });

    await renderPanel();

    expect(screen.queryByText("Ventas contra entrega")).toBeNull();
    expect(await screen.findByText(/No tenés acceso/)).toBeVisible();
  });

  it("lists the catalogue with its versions", async () => {
    await renderPanel();

    expect(await screen.findByText("Ventas contra entrega")).toBeVisible();
    // The version, with the changelog that was published with it.
    expect(screen.getByText("v1 — primera")).toBeVisible();
    // Generally available: there is nothing to promote it to.
    expect(screen.queryByRole("button", { name: /Promover/ })).toBeNull();
  });

  it("publishes a new version with a changelog", async () => {
    await renderPanel();

    await userEvent.type(
      await screen.findByLabelText("Qué cambió"),
      "Arregla el saludo",
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(calls.published).not.toBeNull());
    expect(calls.published).toMatchObject({
      _template_id: TEMPLATE_ID,
      _changelog: "Arregla el saludo",
    });
  });

  it("publishes to two organizations first, when asked to", async () => {
    // T5: a version that goes out to the whole customer base at once is a
    // prompt change nobody piloted.
    await renderPanel();

    await userEvent.type(
      await screen.findByLabelText(
        "Publicar solo para (ids, separados por coma)",
      ),
      " 22222222-0000-4000-8000-000000000001 , 22222222-0000-4000-8000-000000000002 ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(calls.published).not.toBeNull());
    expect(calls.published).toMatchObject({
      _canary_organizations: [
        "22222222-0000-4000-8000-000000000001",
        "22222222-0000-4000-8000-000000000002",
      ],
    });
  });

  it("promotes a staged version, and only a staged one", async () => {
    server.use(
      http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
        HttpResponse.json([
          {
            ...TEMPLATES[0],
            agent_template_versions: [
              {
                ...TEMPLATES[0].agent_template_versions[0],
                canary_organizations: ["22222222-0000-4000-8000-000000000001"],
              },
            ],
          },
        ]),
      ),
      http.post(
        "http://127.0.0.1:54321/rest/v1/rpc/promote_agent_template_version",
        async ({ request }) => {
          calls.promoted = await request.json();
          return HttpResponse.json({ template_id: TEMPLATE_ID, version: 1 });
        },
      ),
    );

    await renderPanel();

    await userEvent.click(
      await screen.findByRole("button", { name: "Promover v1" }),
    );

    await waitFor(() => expect(calls.promoted).not.toBeNull());
    expect(calls.promoted).toMatchObject({
      _template_id: TEMPLATE_ID,
      _version: 1,
    });
  });

  it("retires a version, saying what that does and does not do", async () => {
    await renderPanel();

    await userEvent.click(
      await screen.findByRole("button", { name: "Retirar v1" }),
    );

    await waitFor(() => expect(calls.retired).not.toBeNull());
    expect(calls.retired).toMatchObject({
      _template_id: TEMPLATE_ID,
      _version: 1,
    });

    expect(
      screen.getByText(/Los agentes que ya la usan siguen funcionando/),
    ).toBeVisible();
  });

  it("creates a template from an agent of the template organization", async () => {
    await renderPanel();

    await userEvent.type(await screen.findByLabelText("Nombre"), "Reservas");
    await userEvent.type(screen.getByLabelText("Identificador"), "reservas");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(calls.created).not.toBeNull());
    expect(calls.created).toMatchObject({
      name: "Reservas",
      slug: "reservas",
      source_agent_id: "a0000000-0000-4000-8000-00000000000a",
    });
  });
});
