// T1 — the business profile screen: the seven things a merchant knows about
// their own shop, replacing a blank box that asked them to write a prompt.
//
// The case that matters is not "it saves". It is the LIST. `organizations.extra`
// is written as a JSON merge patch, and a merge patch replaces an array whole
// (§3.6): a screen that sends only the method somebody just ticked deletes the
// other four without saying so, and the agent quietly stops offering them.
// Everything below exists to keep that from being discovered in production.
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
import { BUSINESS_PROFILE_LIMITS } from "@/supabase/types/business_profile";

const role = { value: "admin" };

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ history: { back: vi.fn(), canGoBack: () => false } }),
  useLocation: () => ({ pathname: "/settings/organization", hash: "" }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  redirect: (options: unknown) => options,
}));

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { id: "agent-self", role: role.value } }),
}));

const organization = {
  id: ORG_A,
  name: "Alpha",
  extra: {
    brand_voice: "Tutea al cliente.",
    error_messages_direction: "internal",
    business_profile: {
      industry: "Zapatillas urbanas",
      sells: "Zapatillas de calle y running.",
      payment_methods: ["Webpay", "Transferencia"],
    },
  },
};

const saved: { body: Record<string, unknown> | null } = { body: null };

const server = setupServer(
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
  const module = await import("@/routes/_auth/settings/organization/index");
  const Page = (
    module.Route as unknown as { options: { component: ComponentType } }
  ).options.component;

  render(
    <QueryClientProvider client={createQueryClient()}>
      <Page />
    </QueryClientProvider>,
  );

  // The form renders before the row arrives; these cases are about what it
  // shows once it has.
  await waitFor(() =>
    expect(screen.getByLabelText("Rubro")).toHaveValue("Zapatillas urbanas"),
  );
}

/** What was actually sent for the profile. */
const sentProfile = () =>
  (saved.body!.extra as Record<string, unknown>).business_profile as Record<
    string,
    unknown
  >;

describe("T1: the business profile", () => {
  it("shows what the organization already said about itself", async () => {
    await renderPage();

    expect(screen.getByLabelText("Qué vende")).toHaveValue(
      "Zapatillas de calle y running.",
    );
    // A saved method reads as chosen, not as text in a box.
    expect(screen.getByRole("button", { name: "Webpay" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Mercado Pago" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("sends the whole list of payment methods, not the one just ticked", async () => {
    await renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Mercado Pago" }));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(saved.body).not.toBeNull());

    expect(sentProfile().payment_methods).toEqual([
      "Webpay",
      "Transferencia",
      "Mercado Pago",
    ]);
  });

  it("removing a method sends the ones that are left", async () => {
    await renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Webpay" }));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(saved.body).not.toBeNull());

    expect(sentProfile().payment_methods).toEqual(["Transferencia"]);
  });

  it("takes a payment method that is not on the list", async () => {
    await renderPage();

    await userEvent.type(
      screen.getByLabelText("Otro medio de pago"),
      "Cheque al día",
    );
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(saved.body).not.toBeNull());

    expect(sentProfile().payment_methods).toEqual([
      "Webpay",
      "Transferencia",
      "Cheque al día",
    ]);
  });

  it("keeps the rest of extra when it saves the profile", async () => {
    await renderPage();

    await userEvent.type(screen.getByLabelText("Rubro"), " y outdoor");
    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(saved.body).not.toBeNull());

    const extra = saved.body!.extra as Record<string, unknown>;

    expect(extra.brand_voice).toBe("Tutea al cliente.");
    expect(sentProfile().industry).toBe("Zapatillas urbanas y outdoor");
  });

  it("stops a field at the limit the API validates against", async () => {
    await renderPage();

    // The same number on both sides, read from the mirrored module: a screen
    // that lets somebody type past it produces a profile the agent silently
    // drops.
    expect(screen.getByLabelText("Rubro")).toHaveAttribute(
      "maxLength",
      String(BUSINESS_PROFILE_LIMITS.industry),
    );
    expect(screen.getByLabelText("Cambios y devoluciones")).toHaveAttribute(
      "maxLength",
      String(BUSINESS_PROFILE_LIMITS.returns_policy),
    );
  });

  it("is read-only for a member", async () => {
    role.value = "member";
    await renderPage();

    expect(screen.getByLabelText("Rubro")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Webpay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeDisabled();
  });

  // D12: the screen asks a merchant about their shop, never about the agent.
  it("asks nothing that sounds like configuring an agent", async () => {
    await renderPage();

    const text = document.body.textContent ?? "";

    for (const word of ["prompt", "system", "token", "JSON", "modelo"]) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
