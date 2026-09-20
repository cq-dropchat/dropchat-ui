import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Route } from "./errors";
import type { ErrorIssue } from "@/queries/useErrorIssues";

// E1 — what the panel decides before it draws anything: who gets in, and
// whether the baseline is still open. Both have a failure mode that is silent
// rather than loud, which is why they are pinned here.

const mocks = vi.hoisted(() => ({
  isPlatformAdmin: vi.fn(),
  errorIssues: vi.fn(),
  errorSettings: vi.fn(),
}));

vi.mock("@/queries/useErrorIssues", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/queries/useErrorIssues")>()),
  useIsPlatformAdmin: mocks.isPlatformAdmin,
  useErrorIssues: mocks.errorIssues,
  useErrorSettings: mocks.errorSettings,
  useTriageErrorIssue: () => ({ mutate: vi.fn(), isPending: false }),
  useCloseErrorBaseline: () => ({ mutate: vi.fn(), isPending: false }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function issue(overrides: Partial<ErrorIssue> = {}): ErrorIssue {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    fingerprint: "abc",
    source: "frontend",
    kind: "TypeError",
    title: "no se puede leer x",
    culprit: "/conversations/:id",
    release: null,
    status: "new",
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    regressed_at: null,
    events: 3,
    first_sample: {},
    last_sample: {},
    notes: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  } as ErrorIssue;
}

function Panel() {
  const Component = Route.options.component!;
  return <Component />;
}

beforeEach(() => {
  mocks.errorIssues.mockReturnValue({ data: [], isLoading: false });
  mocks.errorSettings.mockReturnValue({ data: { baseline_open: false } });
});

describe("E1: who gets into the panel", () => {
  it("refuses someone who is not a platform admin", () => {
    mocks.isPlatformAdmin.mockReturnValue({ data: false, isPending: false });

    render(<Panel />, { wrapper });

    expect(screen.getByText("Sin acceso a este panel")).toBeInTheDocument();
  });

  // The failure this catches is silent: while useAuth is still putting the
  // session in the store the query is disabled, and a disabled react-query
  // query reports isLoading false with no data. Read as "not an admin", that
  // flashes the refusal screen at the one person allowed in.
  it("waits instead of refusing while the session is still loading", () => {
    mocks.isPlatformAdmin.mockReturnValue({ data: undefined, isPending: true });

    render(<Panel />, { wrapper });

    expect(screen.queryByText("Sin acceso a este panel")).toBeNull();
  });

  it("lets a platform admin in", () => {
    mocks.isPlatformAdmin.mockReturnValue({ data: true, isPending: false });
    mocks.errorIssues.mockReturnValue({
      data: [issue()],
      isLoading: false,
    });

    render(<Panel />, { wrapper });

    expect(screen.getByText("no se puede leer x")).toBeInTheDocument();
    expect(screen.getByText(/3 veces/)).toBeInTheDocument();
  });
});

describe("E1: the baseline banner", () => {
  beforeEach(() => {
    mocks.isPlatformAdmin.mockReturnValue({ data: true, isPending: false });
  });

  it("is up while the baseline is open", () => {
    mocks.errorSettings.mockReturnValue({ data: { baseline_open: true } });

    render(<Panel />, { wrapper });

    expect(screen.getByText("Modo aprendizaje")).toBeInTheDocument();
  });

  it("is gone once the baseline is closed", () => {
    mocks.errorSettings.mockReturnValue({ data: { baseline_open: false } });

    render(<Panel />, { wrapper });

    expect(screen.queryByText("Modo aprendizaje")).toBeNull();
  });
});

// The other half of the baseline — that an absent settings row reads as open,
// so a fresh install opens quiet instead of full of the past — is not testable
// from here: useErrorSettings is mocked, and asserting it would only be
// asserting the mock. It is pinned where it is decided, in the API repo's
// 31_error_issues.test.sql ("with no settings row the baseline is open").
