import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import Message from "./Message";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useMedia } from "@/hooks/useMedia";
import { fileMessageRow, messageRow } from "@/test/factories";

// F04 — no error boundary: a malformed `content` from a connector throws in
// render and React 19 unmounts the root, blanking the app for every member
// who opens the conversation.

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("F04: <Message> with malformed file content", () => {
  it("renders the unavailable-media fallback when file.uri is empty", () => {
    const message = fileMessageRow({}, { uri: "" });

    render(<Message message={message} first last />, { wrapper });

    expect(
      screen.getByText("Contenido multimedia no disponible"),
    ).toBeInTheDocument();
  });

  it("renders a retry affordance, not a crash, on a media reference with no object", () => {
    // `internal://media/` — a media part whose storage key is empty. useMedia
    // used to throw from render here.
    const message = fileMessageRow({}, { uri: "internal://media/" });

    let container: HTMLElement | undefined;
    expect(() => {
      container = render(<Message message={message} first last />, {
        wrapper,
      }).container;
    }).not.toThrow();

    // The bubble is there, in its error state (load button shown).
    expect(
      container!.querySelector('use[href="/icons.svg#image-download"]'),
    ).not.toBeNull();
  });

  it("keeps the siblings alive when one message crashes", () => {
    const good = messageRow({
      content: { version: "1", type: "text", kind: "text", text: "sigo acá" },
    });
    // A record-only (internal) file part: media renderers refuse it.
    const bad = fileMessageRow(
      {
        sender_address: null,
        agent_id: "aaaaaaaa-0000-4000-8000-00000000a0a9",
      },
      { uri: "internal://media/organizations/x/attachments/y" },
    );
    bad.content = { ...bad.content, internal: true } as typeof bad.content;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <>
        <Message message={good} first last />
        <Message message={bad} first last />
      </>,
      { wrapper },
    );

    expect(screen.getByText("sigo acá")).toBeInTheDocument();
    expect(screen.getByText("Mensaje no soportado")).toBeInTheDocument();

    consoleError.mockRestore();
  });
});

describe("F04: useMedia", () => {
  it("reports an error state instead of throwing on a bad media reference", () => {
    const message = fileMessageRow({}, { uri: "internal://media/" });

    const { result } = renderHook(() => useMedia(message));

    expect(result.current.load.status).toBe("error");
    expect(result.current.load.error).toMatch(/media/i);
  });

  it("reports an error state for a non-file message", () => {
    const message = messageRow();

    const { result } = renderHook(() => useMedia(message));

    expect(result.current.load.status).toBe("error");
  });
});

describe("F04: <ErrorBoundary>", () => {
  it("renders the fallback when a child throws", () => {
    function Boom(): ReactNode {
      throw new Error("boom");
    }
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={(e) => <div>caught {e.message}</div>}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("caught boom")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
