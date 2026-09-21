// T7 — el panel de plantillas, en el layout de la app.
//
// It used to be a page of its own: a bare div with everything stacked in it.
// Now it is a screen like the others — the icon sidebar on the left, this list
// in the panel, and the template you pick in the center — so it is read the
// same way as conversations, agents or stats.
//
// This file is the LIST half. The center is `TemplateCenter.test.tsx`.
//
// It is still the platform's: not in the menu for a tenant, reached by typing
// the URL, and RLS is what actually guards it — the check here only decides
// what to draw.
import { render, screen } from "@testing-library/react";
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
import { TEMPLATES, TEMPLATE_ID } from "@/test/templateFixtures";

const mocks = vi.hoisted(() => ({ isPlatformAdmin: vi.fn() }));
const navigate = vi.fn();
const pathname = { value: "/templates" };

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
  }),
  useNavigate: () => navigate,
  useLocation: (options?: { select?: (location: unknown) => unknown }) => {
    const location = { pathname: pathname.value, hash: "" };
    return options?.select ? options.select(location) : location;
  },
  Outlet: () => null,
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/queries/useErrorIssues", () => ({
  useIsPlatformAdmin: mocks.isPlatformAdmin,
}));

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
    HttpResponse.json(TEMPLATES),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  navigate.mockClear();
  pathname.value = "/templates";
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

async function renderList() {
  const module = await import("@/routes/_auth/templates");
  const Page = (
    module.Route as unknown as { options: { component: ComponentType } }
  ).options.component;

  render(
    <QueryClientProvider client={createQueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
}

describe("T7: the template panel's list", () => {
  it("shows nothing to somebody who is not a platform admin", async () => {
    mocks.isPlatformAdmin.mockReturnValue({ data: false, isPending: false });

    await renderList();

    expect(screen.queryByText("Ventas contra entrega")).toBeNull();
    expect(await screen.findByText(/No tenés acceso/)).toBeVisible();
  });

  it("lists the catalogue the way every other list on the left is listed", async () => {
    await renderList();

    expect(await screen.findByText("Ventas contra entrega")).toBeVisible();
    // Slug, category and the newest version, in the description line: what a
    // SectionItem shows under its title everywhere else in the app.
    expect(screen.getByText(/ventas-contra-entrega/)).toBeVisible();
    expect(screen.getByText(/v1/)).toBeVisible();
  });

  it("opens a template in the center instead of expanding in place", async () => {
    await renderList();

    await userEvent.click(await screen.findByText("Ventas contra entrega"));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: `/templates/${TEMPLATE_ID}` }),
    );
  });

  it("marks the one that is open", async () => {
    pathname.value = `/templates/${TEMPLATE_ID}`;

    await renderList();

    const item = (await screen.findByText("Ventas contra entrega")).closest(
      "div.group",
    );

    expect(item?.className).toContain("bg-accent");
  });

  it("offers a new template at the top, like «Agregar agente»", async () => {
    await renderList();

    await userEvent.click(await screen.findByText("Nueva plantilla"));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/templates/new" }),
    );
  });

  it("says when the catalogue is empty rather than showing an empty list", async () => {
    server.use(
      http.get("http://127.0.0.1:54321/rest/v1/agent_templates", () =>
        HttpResponse.json([]),
      ),
    );

    await renderList();

    expect(await screen.findByText(/Todavía no hay plantillas/)).toBeVisible();
  });
});
