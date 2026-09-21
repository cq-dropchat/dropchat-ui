// T7 — what an agent installed from a template says about itself.
//
// The agent does not carry a copy of the template: it points at a version and
// its own `extra` is the override layer (T6). So this block is where the whole
// arrangement becomes visible to somebody who did not read the spec — what it
// is based on, that there is a newer version and what would change, that the
// version it runs on was pulled, and how to stop being a template at all.
//
// The «qué campos con override cambiaron» part is the one worth being careful
// about: an update to a field the organization has overridden changes NOTHING
// for them, and saying "actualizá" without saying that is how somebody updates
// and then wonders why nothing moved.
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
import { aiAgentRow, ORG_A } from "@/test/factories";
import TemplateSection from "@/components/TemplateSection";
import type { AIAgentRow } from "@/supabase/client";

const TEMPLATE_ID = "11111111-0000-4000-8000-000000000001";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

function version(number: number, overrides: Record<string, unknown> = {}) {
  return {
    template_id: TEMPLATE_ID,
    version: number,
    config: { instructions: `Instrucciones base v${number}` },
    config_hash: `h${number}`,
    changelog: `Cambios de la v${number}`,
    published_by: null,
    published_at: "2026-09-21T00:00:00.000Z",
    retired_at: null,
    ...overrides,
  };
}

const state = {
  versions: [version(2), version(1)],
  patched: null as Record<string, unknown> | null,
  rpc: null as Record<string, unknown> | null,
};

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
    HttpResponse.json([
      {
        id: TEMPLATE_ID,
        slug: "ventas-contra-entrega",
        name: "Ventas contra entrega",
        description: "Toma pedidos.",
        category: "ventas",
        source_agent_id: null,
        archived_at: null,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
        agent_template_versions: state.versions,
      },
    ]),
  ),
  http.get("http://127.0.0.1:54321/rest/v1/agent_template_versions", () =>
    HttpResponse.json(state.versions),
  ),
  http.patch("http://127.0.0.1:54321/rest/v1/agents", async ({ request }) => {
    state.patched = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...agent(), ...state.patched });
  }),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/update_agent_template_version",
    async ({ request }) => {
      state.rpc = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(agent());
    },
  ),
  http.post(
    "http://127.0.0.1:54321/rest/v1/rpc/unlink_agent_template",
    async ({ request }) => {
      state.rpc = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(agent());
    },
  ),
);

function agent(overrides: Partial<AIAgentRow> = {}): AIAgentRow {
  return aiAgentRow({
    id: "a0000000-0000-4000-8000-000000000009",
    name: "Ventas contra entrega",
    template_id: TEMPLATE_ID,
    template_version: 1,
    template_auto_update: false,
    extra: { mode: "draft" },
    ...overrides,
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  state.versions = [version(2), version(1)];
  state.patched = null;
  state.rpc = null;
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

function show(row: AIAgentRow) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <TemplateSection agent={row} isAdmin />
    </QueryClientProvider>,
  );
}

describe("T7: an agent based on a template", () => {
  it("says what it is based on", async () => {
    show(agent());

    expect(
      await screen.findByText("Basado en Ventas contra entrega v1"),
    ).toBeVisible();
  });

  it("shows nothing at all for an agent that is not based on one", () => {
    show(agent({ template_id: null, template_version: null }));

    expect(screen.queryByText(/Basado en/)).toBeNull();
  });

  it("offers the newer version with its changelog", async () => {
    show(agent());

    expect(await screen.findByText("Actualización disponible")).toBeVisible();
    expect(screen.getByText("Cambios de la v2")).toBeVisible();
  });

  it("names the fields the organization overrode, which will not change", async () => {
    // The new version rewrites the instructions, and this organization wrote
    // its own. Updating changes nothing it can see — say so before, not after.
    state.versions = [
      version(2, { config: { instructions: "otra cosa" } }),
      version(1),
    ];

    show(agent({ extra: { mode: "draft", instructions: "las mías" } }));

    expect(await screen.findByText("Actualización disponible")).toBeVisible();
    expect(screen.getByText(/Instrucciones/, { selector: "li" })).toBeVisible();
  });

  it("takes the update", async () => {
    show(agent());

    await userEvent.click(
      await screen.findByRole("button", { name: "Actualizar" }),
    );

    await waitFor(() => expect(state.rpc).not.toBeNull());
    expect(state.rpc).toMatchObject({
      _agent_id: "a0000000-0000-4000-8000-000000000009",
      _version: 2,
    });
  });

  it("warns when the version it runs on was pulled", async () => {
    state.versions = [version(1, { retired_at: "2026-09-21T03:00:00.000Z" })];

    show(agent());

    expect(
      await screen.findByText(/Esta versión ya no se ofrece/),
    ).toBeVisible();
  });

  it("switches automatic updates on", async () => {
    show(agent());

    await userEvent.click(
      await screen.findByLabelText("Actualizar automáticamente"),
    );

    await waitFor(() => expect(state.patched).not.toBeNull());
    expect(state.patched).toMatchObject({ template_auto_update: true });
  });

  it("shows the base instructions read-only", async () => {
    show(agent());

    const base = await screen.findByLabelText("Instrucciones de la plantilla");

    // It arrives with the version, which is a round trip away.
    await waitFor(() => expect(base).toHaveValue("Instrucciones base v1"));
    expect(base).toHaveAttribute("readonly");
  });

  it("unlinks, with the consequence stated first", async () => {
    show(agent());

    await userEvent.click(
      await screen.findByRole("button", { name: "Desvincular" }),
    );

    // Not a confirm() — a sentence on the page, and then the button.
    expect(screen.getByText(/deja de recibir versiones nuevas/)).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Desvincular de todos modos" }),
    );

    await waitFor(() => expect(state.rpc).not.toBeNull());
    expect(state.rpc).toMatchObject({
      _agent_id: "a0000000-0000-4000-8000-000000000009",
    });
  });

  it("lets a member look and not touch", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <TemplateSection agent={agent()} isAdmin={false} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Basado en Ventas contra entrega v1"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeDisabled();
    expect(screen.getByLabelText("Actualizar automáticamente")).toBeDisabled();
  });
});
