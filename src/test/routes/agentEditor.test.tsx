// The agent's own screen, after the redesign.
//
// What is asserted here is what the old screen got wrong and nothing else:
//
// - saving said nothing at all, so the only way to know it had worked was to
//   go looking for the effect;
// - the two actions at the foot — chat with the agent, try it as a customer —
//   were REPLACED by «Actualizar» the moment a field changed, with nothing
//   saying why they had gone or that a test would use the saved version;
// - deleting happened on the first click of a bin;
// - without admin rights everything still looked editable, and the reason
//   lived in a `title` attribute that a touch screen never shows;
// - the entry agent writes the ORGANIZATION's row, not the agent's, and
//   nothing said it saves on its own.
import { render, screen, waitFor, within } from "@testing-library/react";
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
import type { ReactNode } from "react";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import Toaster from "@/components/ui/Toaster";
import useToasts from "@/stores/useToasts";
import { aiAgentRow, ORG_A } from "@/test/factories";

const AGENT_ID = "a0000000-0000-4000-8000-00000000000a";

const role = { value: "admin" };
const navigate = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useRouter: () => ({ history: { back: vi.fn(), canGoBack: () => false } }),
  useLocation: () => ({ pathname: `/agents/${AGENT_ID}`, hash: "" }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/queries/useAgents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/queries/useAgents")>()),
  useCurrentAgent: () => ({ data: { id: "agent-self", role: role.value } }),
}));

const agent = aiAgentRow({
  id: AGENT_ID,
  name: "Vale, ventas",
  extra: {
    mode: "active",
    instructions: "Confirmá la dirección antes de despachar.",
    response_delay_seconds: 3,
    tools: [],
  },
});

const organization = {
  id: ORG_A,
  name: "Tienda Ruca",
  entry_agent_id: null as string | null,
  extra: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

/** T7 backwards: whether the catalogue publishes from THIS agent. */
const sourceOf: { rows: Record<string, unknown>[] } = { rows: [] };

const wrote = {
  agent: null as Record<string, unknown> | null,
  organization: null as Record<string, unknown> | null,
  deleted: false,
  fail: false,
};

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/agents", () =>
    HttpResponse.json(agent),
  ),
  http.patch("http://127.0.0.1:54321/rest/v1/agents", async ({ request }) => {
    if (wrote.fail) {
      return HttpResponse.json(
        { message: "new row violates row-level security policy" },
        { status: 403 },
      );
    }
    wrote.agent = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...agent, ...wrote.agent });
  }),
  http.delete("http://127.0.0.1:54321/rest/v1/agents", () => {
    wrote.deleted = true;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("http://127.0.0.1:54321/rest/v1/organizations", () =>
    HttpResponse.json(organization),
  ),
  http.patch(
    "http://127.0.0.1:54321/rest/v1/organizations",
    async ({ request }) => {
      wrote.organization = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...organization, ...wrote.organization });
    },
  ),
  http.get("http://127.0.0.1:54321/rest/v1/organizations_addresses", () =>
    HttpResponse.json([
      { organization_id: ORG_A, service: "local", address: "local-1" },
      { organization_id: ORG_A, service: "sandbox", address: "sandbox-1" },
    ]),
  ),
  http.get("http://127.0.0.1:54321/rest/v1/model_tiers", () =>
    HttpResponse.json([
      {
        slug: "rapido",
        name: "Rápido",
        description: "Contesta al toque.",
        provider: "groq",
        sort_order: 1,
      },
    ]),
  ),
  http.get("http://127.0.0.1:54321/rest/v1/agent_templates", ({ request }) =>
    HttpResponse.json(
      new URL(request.url).searchParams.has("source_agent_id")
        ? sourceOf.rows
        : [],
    ),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  wrote.agent = null;
  wrote.organization = null;
  wrote.deleted = false;
  wrote.fail = false;
  organization.entry_agent_id = null;
  sourceOf.rows = [];
  navigate.mockClear();
  role.value = "admin";
  useToasts.getState().clear();
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

async function open() {
  const { default: AgentEditor } = await import(
    "@/components/agents/AgentEditor"
  );

  render(
    <QueryClientProvider client={createQueryClient()}>
      <AgentEditor agentId={AGENT_ID} />
      <Toaster />
    </QueryClientProvider>,
  );

  await screen.findByRole("heading", { name: "Vale, ventas", level: 1 });
}

describe("the agent's screen", () => {
  it("groups the eleven fields into named cards", async () => {
    await open();

    for (const group of [
      "Identidad",
      "Cómo atiende",
      "Qué dice y qué puede hacer",
      "Motor",
    ]) {
      expect(
        screen.getByRole("heading", { name: group, level: 2 }),
      ).toBeVisible();
    }
  });

  it("keeps both actions on screen once a field changes, and says why they wait", async () => {
    await open();

    const chat = screen.getByRole("button", { name: /Chatear/ });
    const test = screen.getByRole("button", { name: /Probar como cliente/ });
    expect(chat).toBeEnabled();

    await userEvent.type(screen.getByLabelText("Nombre"), "!");

    // They are still there — that is the whole point — and they say what to
    // do about it rather than disappearing.
    expect(chat).toBeVisible();
    expect(test).toBeDisabled();
    expect(test).toHaveAccessibleDescription(
      "Guardá los cambios para probarlos.",
    );
    expect(screen.getByText("Cambios sin guardar")).toBeVisible();
  });

  it("says out loud that it saved, and stops being dirty", async () => {
    await open();

    await userEvent.type(screen.getByLabelText("Nombre"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(wrote.agent).not.toBeNull());
    expect(wrote.agent).toMatchObject({ name: "Vale, ventas!" });

    expect(await screen.findByText("Guardaste a Vale, ventas")).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText("Cambios sin guardar")).toBeNull(),
    );
  });

  it("says out loud when it could not save, and keeps the changes", async () => {
    wrote.fail = true;
    await open();

    await userEvent.type(screen.getByLabelText("Nombre"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("No se pudo guardar")).toBeVisible();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Vale, ventas!");
    expect(screen.getByText("Cambios sin guardar")).toBeVisible();
  });

  it("gives back what was typed when the change is discarded", async () => {
    await open();

    await userEvent.type(screen.getByLabelText("Nombre"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Vale, ventas");
    await waitFor(() =>
      expect(screen.queryByText("Cambios sin guardar")).toBeNull(),
    );
  });

  it("asks before deleting the agent", async () => {
    await open();

    await userEvent.click(
      screen.getByRole("button", { name: /Eliminar este agente/ }),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Las conversaciones que atendió/),
    ).toBeVisible();
    expect(wrote.deleted).toBe(false);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Eliminar" }),
    );

    await waitFor(() => expect(wrote.deleted).toBe(true));
    expect(navigate).toHaveBeenCalled();
  });

  it("says the entry agent saves on its own, and saves it on its own", async () => {
    await open();

    expect(screen.getByText("Se guarda al instante")).toBeVisible();

    await userEvent.click(screen.getByLabelText("Agente de entrada"));

    await waitFor(() => expect(wrote.organization).not.toBeNull());
    expect(wrote.organization).toMatchObject({ entry_agent_id: AGENT_ID });

    // It writes another table, so the agent's own form must not become dirty.
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
    expect(await screen.findByText("Ahora entra por acá")).toBeVisible();
  });

  it("shows a member why nothing is editable, instead of hiding it in a tooltip", async () => {
    role.value = "member";
    await open();

    expect(screen.getByText("Podés mirarlo, no cambiarlo")).toBeVisible();
    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(screen.getByLabelText("Agente de entrada")).toBeDisabled();

    // Looking and testing need no permission, so they stay available.
    expect(screen.getByRole("button", { name: /Chatear/ })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Probar como cliente/ }),
    ).toBeEnabled();
  });

  it("says when the catalogue publishes from this agent, and what deleting it costs", async () => {
    // The pointer read backwards: until now the link existed only in the
    // template panel, so the source agent had no idea it was one — and
    // `source_agent_id` is `on delete set null`.
    sourceOf.rows = [
      {
        id: "11111111-0000-4000-8000-000000000001",
        name: "Ventas contra entrega",
        slug: "ventas-contra-entrega",
      },
    ];

    await open();

    expect(
      await screen.findByText("Origen de «Ventas contra entrega»"),
    ).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: /Eliminar este agente/ }),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Una plantilla se queda sin origen"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/no va a poder publicar versiones nuevas/),
    ).toBeVisible();
  });

  it("says nothing about the catalogue for an agent that is not a source", async () => {
    await open();

    expect(screen.queryByText(/Origen de/)).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: /Eliminar este agente/ }),
    );

    expect(
      within(screen.getByRole("dialog")).queryByText(/sin origen/),
    ).toBeNull();
  });

  it("names the unit and what the delay is for, outside the label", async () => {
    await open();

    const delay = screen.getByLabelText("Demora antes de responder");

    expect(delay).toHaveValue(3);
    expect(delay).toHaveAccessibleDescription(
      /tres mensajes seguidos reciben una sola respuesta/,
    );
  });
});
