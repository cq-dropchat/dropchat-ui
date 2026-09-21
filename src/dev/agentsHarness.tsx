// Dev-only harness for the agent's screen: the real component and the real
// queries, a stubbed PostgREST, no sign-in. Served by `vite` at
// /dev/agents.html; `vite build` only bundles index.html, so it never ships.
//
// It exists because this screen is behind a session and an organization, so
// there is no way to look at it — or at what the redesign did to it — without
// one. The panel it is drawn in is the real left panel: 380px, the app's grid.
//
// ?state=blank|template|origen|member|empty|loading picks which situation to
// draw,
// ?width=<px> resizes the panel the way the handle does.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import "@/global.css";
import AgentEditor from "@/components/agents/AgentEditor";
import Toaster from "@/components/ui/Toaster";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const AGENT = "a0000000-0000-4000-8000-00000000000a";
const TEMPLATE = "11111111-0000-4000-8000-000000000001";

const params = new URLSearchParams(location.search);
const state = params.get("state") || "blank";
const width = Number(params.get("width") || 380);

const fromTemplate = state === "template";
// The agent the catalogue publishes FROM, which lives in the template
// organization and looked like any other agent until it said so.
const isSource = state === "origen";
const empty = state === "empty";

const agent = {
  id: AGENT,
  organization_id: ORG,
  user_id: null,
  name: fromTemplate ? "Postventa" : "Vale, ventas",
  picture: null,
  role: "member",
  template_id: fromTemplate ? TEMPLATE : null,
  template_version: fromTemplate ? 2 : null,
  template_auto_update: false,
  deleted_at: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-12T10:00:00.000Z",
  extra: {
    mode: fromTemplate ? "draft" : "active",
    description: empty
      ? ""
      : "Toma pedidos contra entrega y confirma la dirección.",
    instructions: empty
      ? ""
      : "Sos Vale, del equipo de ventas de Tienda Ruca.\n\nConfirmá cada pedido antes de que salga de bodega: nombre, calle con número, depto o block si corresponde, y comuna.\n\nNunca prometas un día de entrega: decí «entre 2 y 4 días hábiles».",
    welcome_message: empty
      ? ""
      : "¡Hola! Soy Vale de Tienda Ruca. Vi que entró tu pedido y quiero confirmarlo con vos.",
    response_delay_seconds: 3,
    can_escalate: true,
    model_tier: "rapido",
    tools: empty
      ? []
      : [
          {
            provider: "local",
            type: "mcp",
            label: "Agenda del taller",
            config: {
              url: "https://g.mcp.openbsp.dev/mcp",
              product: "calendar",
              allowed_tools: ["list_events"],
            },
          },
          {
            provider: "local",
            type: "mcp",
            label: "Stock",
            config: {
              url: "https://g.mcp.openbsp.dev/mcp",
              product: "sheets",
              allowed_tools: ["read_sheet"],
            },
          },
          { provider: "local", type: "function", name: "calculator" },
        ],
  },
};

const versions = [
  {
    template_id: TEMPLATE,
    version: 2,
    config: {
      instructions:
        "Confirmá el pedido antes de despacharlo. Pedí comuna y calle con número.",
    },
    config_hash: "h2",
    changelog: "Pregunta la comuna cuando la dirección no la trae.",
    published_by: null,
    published_at: "2026-09-02T00:00:00.000Z",
    retired_at: null,
    canary_organizations: null,
  },
  {
    template_id: TEMPLATE,
    version: 3,
    config: {
      instructions: "Confirmá la dirección antes de despachar.",
      tools: [],
    },
    config_hash: "h3",
    changelog: "Confirma la dirección antes de despachar.",
    published_by: null,
    published_at: "2026-09-18T00:00:00.000Z",
    retired_at: null,
    canary_organizations: null,
  },
];

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (
    input instanceof Request ? input.method : init?.method || "GET"
  ).toUpperCase();

  if (url.includes("/rest/v1/agents")) {
    // Who is asking: `useCurrentAgent` filters by user_id and reads `role`,
    // which is what decides whether anything on the screen is editable.
    if (url.includes("user_id=eq."))
      return Promise.resolve(
        json({
          id: "b0000000-0000-4000-8000-00000000000b",
          organization_id: ORG,
          user_id: "me",
          name: "Vos",
          picture: null,
          role: state === "member" ? "member" : "owner",
          template_id: null,
          template_version: null,
          template_auto_update: false,
          deleted_at: null,
          extra: null,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }),
      );

    // The one situation a stub draws faithfully by doing nothing at all.
    if (state === "loading") return new Promise<Response>(() => undefined);

    if (method === "DELETE")
      return Promise.resolve(new Response(null, { status: 204 }));

    if (method === "PATCH") {
      // Saving has to actually change something, or the screen would go on
      // showing the old name with a notice saying it saved.
      const body = typeof init?.body === "string" ? init.body : "{}";
      const patch = JSON.parse(body) as Record<string, unknown>;
      Object.assign(agent, patch);
      return Promise.resolve(json(agent));
    }

    return Promise.resolve(json(agent));
  }
  if (url.includes("/rest/v1/organizations_addresses"))
    return Promise.resolve(
      json([
        { organization_id: ORG, service: "local", address: "local-1" },
        { organization_id: ORG, service: "sandbox", address: "sandbox-1" },
      ]),
    );
  if (url.includes("/rest/v1/organizations"))
    return Promise.resolve(
      json({
        id: ORG,
        name: "Tienda Ruca",
        entry_agent_id: state === "blank" ? AGENT : null,
        extra: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }),
    );
  if (url.includes("/rest/v1/model_tiers"))
    return Promise.resolve(
      json([
        {
          slug: "rapido",
          name: "Rápido",
          description: "Contesta al toque. Alcanza para confirmar pedidos.",
          provider: "groq",
          sort_order: 1,
        },
        {
          slug: "equilibrado",
          name: "Equilibrado",
          description: "Entiende pedidos con vueltas y direcciones a medias.",
          provider: "openai",
          sort_order: 2,
        },
        {
          slug: "avanzado",
          name: "Avanzado",
          description: "Para reclamos largos y clientes que cambian de idea.",
          provider: "anthropic",
          sort_order: 3,
        },
      ]),
    );
  if (url.includes("/rest/v1/agent_template_versions"))
    return Promise.resolve(json(fromTemplate ? versions : []));
  if (url.includes("/rest/v1/agent_templates")) {
    if (url.includes("source_agent_id="))
      return Promise.resolve(
        json(
          isSource
            ? [
                {
                  id: TEMPLATE,
                  name: "Ventas contra entrega",
                  slug: "ventas-contra-entrega",
                },
              ]
            : [],
        ),
      );

    return Promise.resolve(
      json(
        fromTemplate
          ? [
              {
                id: TEMPLATE,
                slug: "ventas-contra-entrega",
                name: "Ventas contra entrega",
                description: "Toma pedidos.",
                category: "ventas",
                source_agent_id: null,
                archived_at: null,
                created_at: "2026-09-01T00:00:00.000Z",
                updated_at: "2026-09-01T00:00:00.000Z",
                agent_template_versions: versions,
              },
            ]
          : [],
      ),
    );
  }
  if (url.includes("/rest/v1/rpc/")) return Promise.resolve(json(agent));

  return realFetch(input, init);
};

// The same one-liner main.tsx runs, so the harness follows the OS theme too:
// half of what there is to check here is whether the dark side still reads.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const theme = (query: MediaQueryList | MediaQueryListEvent) =>
  document.documentElement.classList.toggle("dark", query.matches);
theme(dark);
dark.addEventListener("change", theme);

useBoundStore.setState((previous) => ({
  ui: {
    ...previous.ui,
    activeOrgId: ORG,
    language: "es",
    // `member` is the one without admin rights; everybody else is an owner.
    user: { id: state === "member" ? "member-a" : "owner-a" } as never,
  },
}));

const rootRoute = createRootRoute({
  component: () => (
    <div className="bg-muted flex h-dvh w-screen">
      {/* The left panel, at the width the app's handle gives it. */}
      <div
        style={{ width }}
        className="border-border bg-background text-foreground relative flex shrink-0 flex-col overflow-hidden border-r"
      >
        <AgentEditor agentId={AGENT} />
      </div>
      <Toaster />
    </div>
  ),
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/$" }),
  ]),
  history: createMemoryHistory({ initialEntries: [`/agents/${AGENT}`] }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
