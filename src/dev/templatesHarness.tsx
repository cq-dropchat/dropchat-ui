// Dev-only harness for the template panel (T7): the real center panel and the
// real queries, a stubbed PostgREST, no sign-in. Served by `vite` at
// /dev/templates.html; `vite build` only bundles index.html, so it never ships.
//
// It exists because the panel belongs to a platform admin of a live project:
// there is no way to look at the publishing form — or at what the redesign did
// to it — without one. The rows below are the same fixtures the tests use.
//
// ?state=new|empty|archived|canary picks which situation to draw.
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
import TemplateCenter from "@/components/templates/TemplateCenter";
import Toaster from "@/components/ui/Toaster";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { TEMPLATE_ID, TEMPLATES, VERSION } from "@/test/templateFixtures";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const AGENT = "a0000000-0000-4000-8000-00000000000a";
const state = new URLSearchParams(location.search).get("state") || "";

const versions = [
  VERSION,
  {
    ...VERSION,
    version: 2,
    changelog: "Pregunta la comuna cuando la dirección no la trae.",
    published_at: "2026-09-02T00:00:00.000Z",
  },
  {
    ...VERSION,
    version: 3,
    changelog: "Confirma la dirección antes de despachar.",
    published_at: "2026-09-18T00:00:00.000Z",
    canary_organizations:
      state === "canary" ? ["22222222-0000-4000-8000-000000000001", ORG] : null,
  },
];

const template = {
  ...TEMPLATES[0],
  archived_at: state === "archived" ? "2026-09-12T00:00:00.000Z" : null,
  agent_template_versions: state === "empty" ? [] : versions,
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);

  if (url.includes("/rest/v1/platform_admins"))
    return Promise.resolve(json({ user_id: "dev" }));
  if (url.includes("/rest/v1/platform_settings"))
    return Promise.resolve(
      json({
        id: true,
        template_org_id: ORG,
        updated_at: "2026-09-21T00:00:00.000Z",
      }),
    );
  if (url.includes("/rest/v1/agent_templates"))
    return Promise.resolve(json([template]));
  if (url.includes("/rest/v1/agents"))
    return Promise.resolve(
      json([
        { id: AGENT, name: "Ventas contra entrega (origen)" },
        { id: "a0000000-0000-4000-8000-00000000000b", name: "Postventa" },
      ]),
    );
  if (url.includes("/rest/v1/rpc/")) return Promise.resolve(json({}));

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
    user: { id: "dev" } as never,
  },
}));

const rootRoute = createRootRoute({
  component: () => (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <TemplateCenter />
      <Toaster />
    </div>
  ),
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/$" }),
  ]),
  history: createMemoryHistory({
    initialEntries: [
      state === "new" ? "/templates/new" : `/templates/${TEMPLATE_ID}`,
    ],
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
