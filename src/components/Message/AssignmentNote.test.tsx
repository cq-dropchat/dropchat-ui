// H6 — the assignment notes of H1, read by a person.
//
// They are stored as data rows (`kind: "assignment"`), and before this the
// chat rendered them as the raw JSON they are: `{"from":null,"to":"8f1c…"}`
// in the middle of a customer conversation. They exist to be read — usually
// by whoever just took the conversation over — so they read as a sentence.
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/queryClient";
import { describe, expect, it, vi } from "vitest";
import AssignmentNote from "./AssignmentNote";
import { messageRow, AGENT_ALICE } from "@/test/factories";
import type { MessageRow } from "@/supabase/client";

const ROBOT = "aaaaaaaa-0000-4000-8000-00000000a0a9";

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgents: () => ({
    data: [
      { id: AGENT_ALICE, name: "Alice", user_id: "user-a" },
      { id: ROBOT, name: "Sofía", user_id: null },
    ],
  }),
}));

function note(data: Record<string, unknown>): MessageRow {
  return messageRow({
    content: {
      version: "1",
      type: "data",
      kind: "assignment",
      internal: true,
      data,
    },
  } as unknown as Partial<MessageRow>);
}

describe("H6: assignment notes", () => {
  it("says who escalated, why, and to whom", () => {
    render(
      <AssignmentNote
        message={note({
          from: ROBOT,
          to: null,
          awaiting_human: true,
          by: ROBOT,
          cause: "escalation",
          category: "reclamo",
          reason: "el pedido llegó dañado",
        })}
      />,
    );

    const line = screen.getByTestId("assignment-note").textContent ?? "";

    expect(line).toContain("Sofía");
    expect(line).toContain("Equipo humano");
    expect(line).toContain("reclamo");
    expect(line).toContain("el pedido llegó dañado");
    // Not the JSON it is stored as.
    expect(line).not.toContain("awaiting_human");
  });

  it("names the person who took the conversation", () => {
    render(
      <AssignmentNote
        message={note({
          from: ROBOT,
          to: AGENT_ALICE,
          awaiting_human: false,
          by: AGENT_ALICE,
          cause: "takeover",
        })}
      />,
    );

    expect(screen.getByTestId("assignment-note").textContent).toContain(
      "Alice",
    );
  });

  it("says who is answering when the system assigned it", () => {
    render(
      <AssignmentNote
        message={note({
          from: null,
          to: ROBOT,
          awaiting_human: false,
          by: null,
          cause: "entry",
        })}
      />,
    );

    expect(screen.getByTestId("assignment-note").textContent).toContain(
      "Sofía",
    );
  });

  it("renders an expiry without inventing an author", () => {
    const line =
      render(
        <AssignmentNote
          message={note({
            from: AGENT_ALICE,
            to: null,
            awaiting_human: false,
            by: null,
            cause: "expiry",
          })}
        />,
      ).getByTestId("assignment-note").textContent ?? "";

    expect(line).toContain("vencimiento");
    expect(line).not.toContain("Alice");
    expect(line).not.toContain("undefined");
  });

  it("renders nothing for a message that is not an assignment note", () => {
    const { container } = render(<AssignmentNote message={messageRow()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

// The dispatch itself: before H6, an assignment note fell through to the
// generic data branch of Message and rendered as raw JSON.
describe("H6: the chat renders notes as notes", () => {
  it("does not render an assignment note as JSON", async () => {
    const { default: Message } = await import("./Message");

    // Message reaches for contact names through a query; the note itself
    // does not, which is the point.
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <Message
          message={note({
            from: null,
            to: ROBOT,
            awaiting_human: false,
            by: null,
            cause: "entry",
          })}
        />
      </QueryClientProvider>,
    );

    expect(container.textContent).toContain("Sofía");
    expect(container.textContent).not.toContain("awaiting_human");
    expect(
      container.querySelector('[data-testid="assignment-note"]'),
    ).not.toBeNull();
  });
});
