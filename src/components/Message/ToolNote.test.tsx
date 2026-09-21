// A tool trace, read by a person who is not a programmer.
//
// The chat rendered these as the raw JSON they are stored as — a card headed
// `Uso: escalate_to_human` with `{ reason: "…", category: "pide_persona" }`
// underneath, sitting in the middle of a customer conversation. Two things
// were wrong with that. The people who see it are shop owners, not
// developers: the admin of an organization is whoever opened it, and a
// payload tells them nothing except that something might be broken. And for
// the one tool that matters most it was pure duplication — the assignment
// note three lines below already said, in a sentence, who handed the
// conversation over, in what category and why.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ToolNote from "./ToolNote";
import { messageRow } from "@/test/factories";
import type { MessageRow } from "@/supabase/client";

const translate = vi.fn((text: string) => text);

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ translate }),
}));

function trace(tool: Record<string, unknown>, text = ""): MessageRow {
  return messageRow({
    // Cast because the cases below deliberately include shapes the union does
    // not name — an MCP tool nobody here can enumerate is the point of the
    // last case, and a fixture that can only express known tools could not
    // test the fallback.
    content: {
      version: "1",
      type: "text",
      kind: "text",
      internal: true,
      tool,
      text,
    } as unknown as MessageRow["content"],
  });
}

describe("a tool trace, as a line rather than a payload", () => {
  it("says the agent used a tool, naming it in words", () => {
    render(
      <ToolNote
        message={trace({
          provider: "local",
          type: "function",
          name: "calculator",
          use_id: "1",
          event: "use",
        })}
      />,
    );

    expect(screen.getByTestId("tool-note").textContent).toContain(
      "Calculadora",
    );
  });

  it("shows no payload, whatever the tool was called with", () => {
    const { container } = render(
      <ToolNote
        message={trace(
          {
            provider: "local",
            type: "sql",
            label: "catalogo",
            name: "execute_sql",
            use_id: "1",
            event: "use",
          },
          'select * from precios where sku = "A-1"',
        )}
      />,
    );

    // The label is what the organization named the connection, so it is the
    // readable half; the argument text never appears.
    expect(container.textContent).toContain("catalogo");
    expect(container.textContent).not.toContain("select");
    expect(container.textContent).not.toContain("{");
  });

  it("says nothing about a handover: the assignment note already does", () => {
    const { container } = render(
      <ToolNote
        message={trace({
          provider: "local",
          type: "function",
          name: "escalate_to_human",
          use_id: "1",
          event: "use",
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing about a handover's result either", () => {
    const { container } = render(
      <ToolNote
        message={trace({
          provider: "local",
          type: "function",
          name: "escalate_to_human",
          use_id: "1",
          event: "result",
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("stays quiet when a tool simply worked", () => {
    // One line per action. A result that went fine adds nothing a reader
    // needs, and doubling every trace is how the transcript became a log.
    const { container } = render(
      <ToolNote
        message={trace({
          provider: "local",
          type: "function",
          name: "calculator",
          use_id: "1",
          event: "result",
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("speaks up when a tool failed, without the error text", () => {
    // That a lookup failed is why the agent's next answer is worse than
    // usual, so it belongs in the transcript. The stack does not.
    render(
      <ToolNote
        message={trace(
          {
            provider: "local",
            type: "http",
            label: "erp",
            name: "request",
            use_id: "1",
            event: "result",
            is_error: true,
          },
          "ECONNREFUSED 10.0.0.5:443",
        )}
      />,
    );

    const line = screen.getByTestId("tool-note").textContent ?? "";

    expect(line).toContain("No pudo usar");
    expect(line).toContain("erp");
    expect(line).not.toContain("ECONNREFUSED");
  });

  it("names a provider's own tool in words too", () => {
    render(
      <ToolNote
        message={trace({
          provider: "google",
          type: "google_search",
          use_id: "1",
          event: "use",
        })}
      />,
    );

    expect(screen.getByTestId("tool-note").textContent).toContain(
      "Búsqueda web",
    );
  });

  it("falls back to the tool's own name rather than to JSON", () => {
    // MCP servers bring tools nobody here can enumerate. An unknown name is
    // still a word, and a word is still better than a payload.
    render(
      <ToolNote
        message={trace({
          provider: "local",
          type: "mcp",
          label: "dropi",
          name: "crear_pedido",
          use_id: "1",
          event: "use",
        })}
      />,
    );

    const line = screen.getByTestId("tool-note").textContent ?? "";

    expect(line).toContain("dropi");
    expect(line).not.toContain("{");
  });

  it("renders nothing for a message that carries no tool", () => {
    const { container } = render(<ToolNote message={messageRow({})} />);

    expect(container).toBeEmptyDOMElement();
  });
});
