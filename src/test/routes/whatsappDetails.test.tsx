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
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ComponentType, ReactNode } from "react";
import { createQueryClient } from "@/queryClient";
import useBoundStore from "@/stores/useBoundStore";
import { ORG_A, WA_A } from "@/test/factories";

// F28 — the WhatsApp dispatcher marks an account whose token Meta rejected
// (`extra.dispatch_auth_failure`) and stops sending, but the integration page
// did not show it: the account looked connected and healthy while every
// outgoing message failed.

// The route module is rendered without a router: params, navigation and the
// header's back button are the router APIs it touches.
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useParams: () => ({ orgAddressId: WA_A }),
  }),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/integrations/whatsapp/x", hash: "" }),
  useRouter: () => ({ history: { back: vi.fn(), canGoBack: () => false } }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

let role = "owner";
vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { id: "agent-self", role } }),
}));

const AT = "2026-09-15T08:30:00.000Z";

let extra: Record<string, unknown> = {};

const server = setupServer(
  http.get("http://127.0.0.1:54321/rest/v1/organizations_addresses", () =>
    HttpResponse.json({
      organization_id: ORG_A,
      service: "whatsapp",
      address: WA_A,
      status: "connected",
      agent_id: null,
      extra: {
        phone_number: "5491100000001",
        verified_name: "Tienda A",
        waba_id: "300000000000001",
        ...extra,
      },
      created_at: "2026-09-01T10:00:00.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  extra = {};
  role = "owner";
  navigate.mockReset();
  useBoundStore.setState((state) => ({
    ui: { ...state.ui, activeOrgId: ORG_A, language: "es" },
  }));
});

async function renderPage() {
  const { Route } = await import(
    "@/routes/_auth/integrations/whatsapp/$orgAddressId/index"
  );
  const Page = (Route as unknown as { options: { component: ComponentType } })
    .options.component;
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
  await screen.findByDisplayValue("Tienda A");
}

describe("F28: WhatsApp integration page", () => {
  it("shows the rejected token: reason, date and Reconnect", async () => {
    extra = {
      access_token: "********",
      dispatch_auth_failure: {
        code: 190,
        message: "Error validating access token: Session has expired",
        at: AT,
      },
    };
    await renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Error validating access token: Session has expired",
    );
    expect(alert).toHaveTextContent(new Date(AT).toLocaleString());
    const reconnect = screen.getByRole("button", { name: "Reconectar" });
    expect(reconnect).toBeEnabled();
    reconnect.click();
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/integrations/whatsapp/new" }),
    );
  });

  it("a member sees the warning but cannot reconnect", async () => {
    role = "member";
    extra = {
      dispatch_auth_failure: { code: 190, message: "expired", at: AT },
    };
    await renderPage();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconectar" })).toBeDisabled();
  });

  it("no mark, no warning", async () => {
    await renderPage();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reconectar" })).toBeNull();
  });
});
