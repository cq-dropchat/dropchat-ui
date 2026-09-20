import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/supabase/client";
import { reportError, resetErrorReportingForTests, routeShape } from "./report";

// E1 — before this, every error in the UI died in the console, a local
// useState, or the full-page fallback. What is pinned here is the part that
// decides whether the panel is readable: which errors are worth a row, how
// they are grouped, and what must never leave the tab.

const rpc = vi.spyOn(supabase, "rpc");

function at(url: string) {
  const { pathname, search, hash } = new URL(url);
  Object.defineProperty(window, "location", {
    value: { pathname, search, hash },
    writable: true,
  });
}

beforeEach(() => {
  resetErrorReportingForTests();
  rpc.mockReset();
  rpc.mockReturnValue({
    then: (resolve: () => void) => {
      resolve();
      return { then: () => undefined };
    },
  } as unknown as ReturnType<typeof supabase.rpc>);
  at("https://app.dropchat.club/conversations");
});

describe("E1: what reaches the panel", () => {
  it("sends an Error's name, message and stack", () => {
    reportError(new TypeError("no se puede leer x"));

    expect(rpc).toHaveBeenCalledOnce();
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("report_error");
    expect(args._kind).toBe("TypeError");
    expect(args._message).toBe("no se puede leer x");
    expect(args._stack).toContain("TypeError");
  });

  // A throw of something that is not an Error is common enough to matter: a
  // string, a rejected fetch, a Supabase `{ message, code }`.
  it("describes a thrown object that only has a message", () => {
    reportError({ name: "PostgrestError", message: "406 no rows" });

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args._kind).toBe("PostgrestError");
    expect(args._message).toBe("406 no rows");
  });

  it("describes a thrown string", () => {
    reportError("algo salió mal");

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args._message).toBe("algo salió mal");
  });
});

describe("E1: grouping", () => {
  // Without this every conversation that hit the same bug would be its own
  // issue, which is exactly the fragmentation the fingerprint exists to stop.
  it("replaces ids in the route so one bug is one issue", () => {
    expect(
      routeShape("/conversations/9f2c8a10-1111-2222-3333-444455556666"),
    ).toBe("/conversations/:id");
    expect(routeShape("/agents/42/tools")).toBe("/agents/:n/tools");
    expect(routeShape("/stats")).toBe("/stats");
  });

  it("reports the route shape as the culprit", () => {
    at(
      "https://app.dropchat.club/conversations/9f2c8a10-1111-2222-3333-444455556666",
    );
    reportError(new Error("boom"));

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args._culprit).toBe("/conversations/:id");
  });
});

describe("E1: what must not leave the tab", () => {
  // The PKCE callback puts an OAuth code in the query string and some flows
  // put an access token in the hash. An error report is not a place to keep
  // credentials, so only the path travels.
  it("never sends the query string or the hash", () => {
    at(
      "https://app.dropchat.club/oauth/callback?code=secreto#access_token=tambien-secreto",
    );
    reportError(new Error("boom"));

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    const serialized = JSON.stringify(args);

    expect(serialized).not.toContain("secreto");
    expect(serialized).not.toContain("tambien-secreto");
    expect((args._context as Record<string, unknown>).path).toBe(
      "/oauth/callback",
    );
  });
});

describe("E1: noise and volume", () => {
  // "Script error." is a throw inside a cross-origin script — a browser
  // extension, an ad blocker — with message and stack stripped by the browser.
  // There is nothing to read and nothing to fix.
  it("drops cross-origin script errors", () => {
    reportError("Script error.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("drops the benign ResizeObserver notice", () => {
    reportError(
      new Error(
        "ResizeObserver loop completed with undelivered notifications.",
      ),
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  // A render loop can fire the same error hundreds of times a second. The
  // database would fold them into one row, but only after answering every
  // request, so the throttle has to be here too.
  it("sends a repeated error once", () => {
    for (let i = 0; i < 50; i += 1) reportError(new Error("mismo error"));
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("caps how much one session can send", () => {
    for (let i = 0; i < 100; i += 1) reportError(new Error(`error ${i}`));
    expect(rpc.mock.calls.length).toBeLessThanOrEqual(25);
  });
});

// Reporting runs inside error handlers and error boundaries, where a second
// failure has nowhere to go: it must never throw.
describe("E1: it cannot make things worse", () => {
  it("swallows a failure of the reporting call itself", () => {
    rpc.mockImplementation(() => {
      throw new Error("la red no está");
    });

    expect(() => reportError(new Error("boom"))).not.toThrow();
  });
});
