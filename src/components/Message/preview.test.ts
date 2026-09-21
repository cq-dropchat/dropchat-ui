// The last-message line of the conversation list, for the rows that are not
// text.
//
// Before this, the list printed `JSON.stringify(content.data)` for every data
// part, so a conversation whose last row was an assignment note announced
// itself as `{"by":"7bee93c5-…","cause":"manual",…}` — the stored shape, on
// the one screen every operator reads first. The bubbles had already learnt
// to read these rows as prose (Message.tsx, AssignmentNote.tsx); the list had
// not.
import { describe, expect, it } from "vitest";
import { dataPreview } from "./preview";
import { messageRow, AGENT_ALICE } from "@/test/factories";
import type { MessageRow } from "@/supabase/client";

const ROBOT = "aaaaaaaa-0000-4000-8000-00000000a0a9";

const t = (key: string) => key;

const name = (id: string | null) =>
  ({ [AGENT_ALICE]: "Alice", [ROBOT]: "Sofía" })[id ?? ""] ?? undefined;

function data(kind: string, payload: unknown, text?: string): MessageRow {
  return messageRow({
    content: { version: "1", type: "data", kind, data: payload, text },
  } as unknown as Partial<MessageRow>);
}

const preview = (message: MessageRow) => dataPreview(message, t, name);

describe("the list preview of a data row", () => {
  it("never shows JSON, whatever the kind", () => {
    const rows = [
      data("assignment", {
        from: null,
        to: ROBOT,
        awaiting_human: false,
        by: AGENT_ALICE,
        cause: "manual",
      }),
      data("location", { name: "Oficina", address: "Av. Siempreviva 742" }),
      data("contacts", [{ name: { formatted_name: "Ana Pérez" } }]),
      data("order", { catalog_id: "c1", product_items: [], text: "" }),
      data("interactive", {
        type: "button_reply",
        button_reply: { id: "b1", title: "Sí, confirmo" },
      }),
      data("button", { text: "Comprar", payload: "buy" }),
      data("template", { name: "hello_world", language: { code: "es" } }),
      data("reaction", { action: "added", unicode: "👍" }),
      data("share", { type: "ig_reel", url: "https://instagram.com/reel/1" }),
      data("referral", { source: "ADS", ads_context_data: {} }),
      data("unsupported", { type: "poll" }),
      // A kind this bundle does not know: a row from a newer API.
      data("something_new", { whatever: true }),
    ];

    for (const row of rows) {
      const line = preview(row);
      expect(line).not.toBe("");
      expect(line).not.toMatch(/[{}[\]]|"/);
    }
  });

  it("reads an assignment note as the sentence the bubble shows", () => {
    expect(
      preview(
        data("assignment", {
          from: null,
          to: ROBOT,
          awaiting_human: false,
          by: AGENT_ALICE,
          cause: "manual",
        }),
      ),
    ).toBe("Alice asignó la conversación a Sofía");
  });

  it("carries the escalation detail, as the note does", () => {
    expect(
      preview(
        data("assignment", {
          from: ROBOT,
          to: null,
          awaiting_human: true,
          by: ROBOT,
          cause: "escalation",
          category: "reclamo",
          reason: "el pedido llegó dañado",
        }),
      ),
    ).toBe("Sofía derivó a Equipo humano: reclamo — el pedido llegó dañado");
  });

  it("prefers the rendered text a part carries", () => {
    // A template sent from the composer keeps its rendered body; that is what
    // the contact received, so it beats the template's name.
    expect(
      preview(
        data("template", { name: "hello_world" }, "Hola Ana, tu pedido salió"),
      ),
    ).toBe("Hola Ana, tu pedido salió");
  });

  it("names what the row is when it has no text", () => {
    expect(preview(data("location", { name: "Oficina" }))).toBe(
      "Ubicación: Oficina",
    );
    expect(
      preview(data("contacts", [{ name: { formatted_name: "Ana Pérez" } }])),
    ).toBe("Contacto: Ana Pérez");
    expect(
      preview(
        data("contacts", [
          { name: { formatted_name: "Ana" } },
          { name: { formatted_name: "Beto" } },
        ]),
      ),
    ).toBe("2 contactos");
    expect(
      preview(
        data("interactive", {
          type: "list_reply",
          list_reply: { id: "l1", title: "Opción 2" },
        }),
      ),
    ).toBe("Opción 2");
    expect(preview(data("reaction", { action: "added", unicode: "👍" }))).toBe(
      "Reaccionó 👍",
    );
    expect(preview(data("reaction", { action: "removed" }))).toBe(
      "Quitó una reacción",
    );
    expect(preview(data("template", { name: "hello_world" }))).toBe(
      "hello_world",
    );
  });

  it("says nothing for a row that is not data", () => {
    expect(preview(messageRow())).toBe("");
  });
});
