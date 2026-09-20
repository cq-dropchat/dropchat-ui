// H6 — the "Atención" screen, which is where an organization says when it is
// reachable and how long an assignment lasts.
//
// Nothing here is cosmetic: H4's sweeps read this schedule to decide when a
// customer has waited too long for a person, so a schedule that closes before
// it opens, or that has two windows over the same hour, must not be savable.
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

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ history: { back: vi.fn(), canGoBack: () => false } }),
  useLocation: () => ({
    pathname: "/settings/organization/attention",
    hash: "",
  }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { id: "agent-self", role: role.value } }),
}));

const organization = {
  id: ORG_A,
  name: "Alpha",
  extra: {
    error_messages_direction: "internal",
    attention: {
      timezone: "America/Santiago",
      business_hours: { mon: [["09:00", "19:00"]] },
      human_wait_minutes: 30,
    },
  },
};

const saved: { body: Record<string, unknown> | null } = { body: null };

const server = setupServer(
  // `.single()`, so the row comes back as an object, not an array.
  http.get("http://127.0.0.1:54321/rest/v1/organizations", () =>
    HttpResponse.json(organization),
  ),
  http.patch(
    "http://127.0.0.1:54321/rest/v1/organizations",
    async ({ request }) => {
      saved.body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json({ ...organization, ...saved.body });
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  saved.body = null;
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
  const module = await import("@/routes/_auth/settings/organization/attention");
  const Page = (
    module.Route as unknown as { options: { component: ComponentType } }
  ).options.component;

  render(
    <QueryClientProvider client={createQueryClient()}>
      <Page />
    </QueryClientProvider>,
  );

  // The schedule renders before the organization's row arrives (all days
  // closed); what these cases are about is what it shows once it has.
  await screen.findByTestId("schedule");
}

/** Waits for the saved schedule to reach the form. */
const mondayFrom = () =>
  screen.findByLabelText("Lunes desde", { exact: false });

describe("H6: the attention screen", () => {
  it("shows the saved schedule, and closed days as closed", async () => {
    await renderPage();

    expect(await mondayFrom()).toHaveValue("09:00");
    expect(screen.getByTestId("day-sun").textContent).toContain("Cerrado");
  });

  it("adds and removes a window", async () => {
    await renderPage();

    await userEvent.click(
      screen.getByLabelText("Agregar tramo Martes", { exact: false }),
    );

    expect(screen.getByLabelText("Martes desde", { exact: false })).toHaveValue(
      "09:00",
    );

    await userEvent.click(
      screen.getByLabelText("Quitar tramo Martes", { exact: false }),
    );

    expect(screen.getByTestId("day-tue").textContent).toContain("Cerrado");
  });

  it("refuses to save a day that closes before it opens", async () => {
    await renderPage();

    const from = await mondayFrom();

    await userEvent.clear(from);
    await userEvent.type(from, "20:00");

    expect(screen.getByRole("alert").textContent).toContain("posterior");
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeDisabled();
  });

  it("refuses two windows over the same hour", async () => {
    await renderPage();

    await mondayFrom();

    await userEvent.click(
      screen.getByLabelText("Agregar tramo Lunes", { exact: false }),
    );

    // The day already runs 09:00–19:00, and the new window is the default
    // 09:00–19:00 too.
    expect(screen.getByRole("alert").textContent).toContain("superponerse");
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeDisabled();
  });

  it("saves the schedule and the limits, keeping the rest of extra", async () => {
    await renderPage();

    await mondayFrom();

    const wait = screen.getByLabelText(
      "Espera máxima por una persona (minutos hábiles)",
      { exact: false },
    );

    await userEvent.clear(wait);
    await userEvent.type(wait, "15");

    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(saved.body).not.toBeNull());

    const extra = saved.body!.extra as Record<string, never>;
    const attention = extra.attention as unknown as Record<string, unknown>;

    expect(attention.human_wait_minutes).toBe(15);
    expect(attention.business_hours).toEqual({
      mon: [["09:00", "19:00"]],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    });
    // The screen edits one key of `extra`; the update carries the whole
    // object, so everything else has to survive it.
    expect(extra.error_messages_direction).toBe("internal");
  });

  it("is read-only for a member", async () => {
    role.value = "member";

    await renderPage();

    expect(await mondayFrom()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeDisabled();
  });
});
