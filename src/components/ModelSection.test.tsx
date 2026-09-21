// T2 — the one place an agent's model is chosen, and what it stopped asking.
//
// Before this, the screen asked a shop owner in Chile for a provider, a
// protocol (a selector whose options read `chat_completions`), an API URL, a
// model id, a temperature, a message limit and whether to force a synthetic
// tool. Every one of those is a question about somebody else's API, and D12
// says the UI does not show raw configuration to people who are not
// programmers.
//
// What it asks now is which of three levels to run on. The rest is a row in
// `public.model_tiers`, which is also the point of the item: when a provider
// retires a model, one UPDATE moves every agent instead of one write each.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useForm } from "react-hook-form";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A } from "@/test/factories";
import ModelSection from "@/components/ModelSection";
import type { AIAgentUpdate } from "@/supabase/client";

const TIERS = [
  {
    slug: "rapido",
    name: "Rápido",
    description: "El más barato y el más veloz.",
    provider: "groq",
    model: "openai/gpt-oss-20b",
    protocol: "chat_completions",
    supports_forced_tools: true,
    sort_order: 1,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
  },
  {
    slug: "equilibrado",
    name: "Equilibrado",
    description: "El que conviene para la mayoría de las tiendas.",
    provider: "openai",
    model: "gpt-5-mini",
    protocol: "chat_completions",
    supports_forced_tools: true,
    sort_order: 2,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
  },
  {
    slug: "avanzado",
    name: "Avanzado",
    description: "Para conversaciones largas o catálogos complicados.",
    provider: "anthropic",
    model: "claude-sonnet-5",
    protocol: "chat_completions",
    supports_forced_tools: true,
    sort_order: 3,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
  },
];

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/model_tiers", () =>
    HttpResponse.json(TIERS),
  ),
);

const saved: { data: AIAgentUpdate | null } = { data: null };

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  saved.data = null;
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

function Host({ values }: { values: AIAgentUpdate }) {
  const { control, register, handleSubmit } = useForm<AIAgentUpdate>({
    defaultValues: values,
  });

  return (
    <form onSubmit={handleSubmit((data) => (saved.data = data))}>
      <ModelSection control={control} register={register} />
      <button type="submit">Guardar</button>
    </form>
  );
}

async function renderSection(values: AIAgentUpdate = { extra: {} }) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Host values={values} />
    </QueryClientProvider>,
  );

  // The levels arrive from the table, so nothing is offered until they do.
  await screen.findByRole("radio", { name: /Equilibrado/ });
}

describe("T2: choosing what an agent runs on", () => {
  it("offers the levels the platform published, in their own order", async () => {
    await renderSection();

    const levels = screen
      .getAllByRole("radio")
      .map((input) => input.getAttribute("value"));

    expect(levels).toEqual(["rapido", "equilibrado", "avanzado"]);
    expect(screen.getByText("El más barato y el más veloz.")).toBeVisible();
  });

  it("shows the level the agent already runs on", async () => {
    await renderSection({ extra: { model_tier: "avanzado" } });

    expect(screen.getByRole("radio", { name: /Avanzado/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Rápido/ })).not.toBeChecked();
  });

  it("saves the slug, which is the only thing the agent stores", async () => {
    await renderSection({ extra: { model_tier: "rapido" } });

    await userEvent.click(screen.getByRole("radio", { name: /Avanzado/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(saved.data).not.toBeNull());

    expect(saved.data!.extra!.model_tier).toBe("avanzado");
    // And nothing else about the model: the provider and the id live in the
    // table, so an agent never carries a copy that can go stale.
    expect(saved.data!.extra!.model).toBeUndefined();
    expect(saved.data!.extra!.api_url).toBeUndefined();
    expect(saved.data!.extra!.protocol).toBeUndefined();
  });

  it("points at the right provider when somebody brings their own key", async () => {
    await renderSection({ extra: { model_tier: "avanzado" } });

    // Behind a door: bringing a key is the advanced path, and the only place
    // a provider is named at all.
    await userEvent.click(
      screen.getByRole("button", { name: /Clave API propia/ }),
    );
    expect(screen.getByText(/console\.anthropic\.com/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    await userEvent.click(screen.getByRole("radio", { name: /Rápido/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Clave API propia/ }),
    );

    // The guidance follows the level, instead of asking somebody to know that
    // «rápido» means Groq.
    expect(screen.getByText(/console\.groq\.com/)).toBeVisible();
  });

  // D12, as a list of the exact questions this screen used to ask.
  it("asks none of the seven technical questions it used to", async () => {
    await renderSection();

    for (const label of [
      "Proveedor",
      "Protocolo",
      "API URL",
      "Modelo",
      "Mensajes máximos",
      "Temperatura",
      "Respuestas en varios mensajes",
    ]) {
      expect(screen.queryByLabelText(label)).toBeNull();
      expect(screen.queryByText(label)).toBeNull();
    }

    expect(document.body.textContent).not.toContain("chat_completions");
  });
});
