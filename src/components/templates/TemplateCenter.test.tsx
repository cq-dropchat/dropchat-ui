// T7 — the center panel of the template screen: the template that is open.
//
// The list on the left says which templates exist; everything you DO to one
// happens here — publish a version, stage it for two organizations, promote
// it, retire it, archive the template — the same way a conversation is chosen
// on the left and read in the center.
//
// It is still the only thing that can publish: `publish_agent_template_version`
// records `auth.uid()` and refuses a caller who is not a platform admin, so it
// cannot be called from the SQL editor at all.
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
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A } from "@/test/factories";
import { TEMPLATE_ID, TEMPLATES, VERSION } from "@/test/templateFixtures";
import TemplateCenter from "@/components/templates/TemplateCenter";

const pathname = { value: `/templates/${TEMPLATE_ID}` };
const navigate = vi.fn();
const mocks = vi.hoisted(() => ({ isPlatformAdmin: vi.fn() }));

vi.mock("@/queries/useErrorIssues", () => ({
  useIsPlatformAdmin: mocks.isPlatformAdmin,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useLocation: (options?: { select?: (location: unknown) => unknown }) => {
    const location = { pathname: pathname.value, hash: "" };
    return options?.select ? options.select(location) : location;
  },
}));

const state = {
  templates: TEMPLATES as unknown[],
  published: null as unknown,
  promoted: null as unknown,
  retired: null as unknown,
  archived: null as unknown,
  created: null as unknown,
};

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
    HttpResponse.json(state.templates),
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/agent_templates",
    async ({ request }) => {
      state.created = await request.json();
      return HttpResponse.json(TEMPLATES[0]);
    },
  ),
  http.patch(
    "http://127.0.0.1:54321/rest/v1/agent_templates",
    async ({ request }) => {
      state.archived = await request.json();
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
      state.published = await request.json();
      return HttpResponse.json({ template_id: TEMPLATE_ID, version: 2 });
    },
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/promote_agent_template_version",
    async ({ request }) => {
      state.promoted = await request.json();
      return HttpResponse.json({ template_id: TEMPLATE_ID, version: 1 });
    },
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/retire_agent_template_version",
    async ({ request }) => {
      state.retired = await request.json();
      return HttpResponse.json({ template_id: TEMPLATE_ID, version: 1 });
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  state.templates = TEMPLATES;
  state.published = null;
  state.promoted = null;
  state.retired = null;
  state.archived = null;
  state.created = null;
  pathname.value = `/templates/${TEMPLATE_ID}`;
  navigate.mockClear();
});
afterAll(() => server.close());

beforeEach(() => {
  mocks.isPlatformAdmin.mockReturnValue({ data: true, isPending: false });
});

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

function show() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <TemplateCenter />
    </QueryClientProvider>,
  );
}

describe("T7: the template that is open", () => {
  // The left panel says «no tenés acceso» and the center is a SEPARATE
  // component that the layout routes by pathname alone — so without this it
  // drew the publishing form beside that sentence for anybody who typed the
  // URL. Nothing could be written (every call raises 42501 and
  // platform_settings comes back empty), but a tenant being shown a form that
  // is not theirs is D12 broken inside the panel D12 paid for.
  it("draws nothing for somebody who is not a platform admin", async () => {
    mocks.isPlatformAdmin.mockReturnValue({ data: false, isPending: false });

    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <TemplateCenter />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText("Publicar")).toBeNull();
    expect(screen.queryByLabelText("Qué cambió")).toBeNull();
  });

  it("draws nothing while it is still finding out", async () => {
    // The answer is a round trip away, and flashing the form for that long is
    // the same mistake with a shorter fuse.
    mocks.isPlatformAdmin.mockReturnValue({ data: undefined, isPending: true });

    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <TemplateCenter />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("asks you to pick one when none is open", async () => {
    pathname.value = "/templates";

    show();

    expect(await screen.findByText(/Elegí una plantilla/)).toBeVisible();
  });

  it("puts the template's name in the header, like a conversation", async () => {
    show();

    const header = await screen.findByTestId("template-header");

    expect(header.textContent).toContain("Ventas contra entrega");
  });

  it("lists its versions with the changelog they were published with", async () => {
    show();

    expect(await screen.findByText("v1 — primera")).toBeVisible();
    // Generally available: there is nothing to promote it to.
    expect(screen.queryByRole("button", { name: /Promover/ })).toBeNull();
  });

  it("publishes a new version with a changelog", async () => {
    show();

    await userEvent.type(
      await screen.findByLabelText("Qué cambió"),
      "Arregla el saludo",
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(state.published).not.toBeNull());
    expect(state.published).toMatchObject({
      _template_id: TEMPLATE_ID,
      _changelog: "Arregla el saludo",
    });
  });

  it("publishes to two organizations first, when asked to", async () => {
    show();

    await userEvent.type(
      await screen.findByLabelText(
        "Publicar solo para (ids, separados por coma)",
      ),
      " 22222222-0000-4000-8000-000000000001 , 22222222-0000-4000-8000-000000000002 ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(state.published).not.toBeNull());
    expect(state.published).toMatchObject({
      _canary_organizations: [
        "22222222-0000-4000-8000-000000000001",
        "22222222-0000-4000-8000-000000000002",
      ],
    });
  });

  it("promotes a staged version, and only a staged one", async () => {
    state.templates = [
      {
        ...TEMPLATES[0],
        agent_template_versions: [
          {
            ...VERSION,
            canary_organizations: ["22222222-0000-4000-8000-000000000001"],
          },
        ],
      },
    ];

    show();

    await userEvent.click(
      await screen.findByRole("button", { name: "Promover v1" }),
    );

    await waitFor(() => expect(state.promoted).not.toBeNull());
    expect(state.promoted).toMatchObject({
      _template_id: TEMPLATE_ID,
      _version: 1,
    });
  });

  it("retires a version, saying what that does and does not do", async () => {
    show();

    await userEvent.click(
      await screen.findByRole("button", { name: "Retirar v1" }),
    );

    await waitFor(() => expect(state.retired).not.toBeNull());
    expect(state.retired).toMatchObject({
      _template_id: TEMPLATE_ID,
      _version: 1,
    });

    expect(
      screen.getByText(/Los agentes que ya la usan siguen funcionando/),
    ).toBeVisible();
  });

  it("archives the template from its own header", async () => {
    show();

    await userEvent.click(
      await screen.findByRole("button", { name: "Archivar" }),
    );

    await waitFor(() => expect(state.archived).not.toBeNull());
    expect(state.archived).toMatchObject({
      archived_at: expect.any(String) as unknown as string,
    });
  });

  it("creates a template from an agent of the template organization", async () => {
    pathname.value = "/templates/new";

    show();

    await userEvent.type(await screen.findByLabelText("Nombre"), "Reservas");
    await userEvent.type(screen.getByLabelText("Identificador"), "reservas");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(state.created).not.toBeNull());
    expect(state.created).toMatchObject({
      name: "Reservas",
      slug: "reservas",
      source_agent_id: "a0000000-0000-4000-8000-00000000000a",
    });
  });

  it("sends you to the runbook when there is no template organization", async () => {
    pathname.value = "/templates/new";
    server.use(
      http.get("http://127.0.0.1:54321/rest/v1/platform_settings", () =>
        HttpResponse.json(null),
      ),
    );

    show();

    expect(
      await screen.findByText(/Falta configurar la organización de plantillas/),
    ).toBeVisible();
  });
});
