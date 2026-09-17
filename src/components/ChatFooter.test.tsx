import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import ChatFooter from "./ChatFooter";
import useBoundStore from "@/stores/useBoundStore";
import { TickContext } from "@/contexts/useTick";
import { conversationRow, messageRow, ORG_A, WA_A } from "@/test/factories";
import type { TemplateData } from "@/supabase/client";

// F29 (step 3) — characterization of ChatFooter (659 lines: the text
// composer, attachments, the 24-hour window and the template composer in one
// component), written before splitting it. It snapshots each state's HTML and
// the record sent for a text and for a template with variables. The split
// must leave every snapshot unchanged.

const sent: unknown[] = [];

vi.mock("@/utils/MessageUtils", () => ({
  // Deterministic stand-in for the record factory: what it was given.
  newMessage: (conv: { id: string }, content: unknown, agentId: string) => ({
    conversation_id: conv.id,
    agent_id: agentId,
    content,
  }),
  pushMessageToStore: (record: unknown) => sent.push(["store", record]),
  pushMessageToDb: (record: unknown) => {
    sent.push(["db", record]);
    return Promise.resolve();
  },
}));
vi.mock("@/utils/ConversationUtils", () => ({
  pushConversationToDb: vi.fn(() => Promise.resolve()),
  saveDraft: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { id: "agent-alice" } }),
}));
// F28: the account rows the footer reads the token mark from.
let orgAddresses: Record<string, unknown>[] = [];
vi.mock("@/queries/useOrganizationsAddresses", () => ({
  useOrganizationsAddresses: () => ({ data: orgAddresses }),
}));
vi.mock("./TemplatePicker", () => ({
  default: () => <div data-testid="template-picker" />,
}));

const NOW = dayjs("2026-09-17T12:00:00.000Z");

const TEMPLATE = {
  id: "tpl-1",
  name: "order_update",
  language: "es",
  status: "APPROVED",
  category: "UTILITY",
  components: [
    {
      type: "HEADER",
      format: "TEXT",
      text: "Pedido {{1}}",
      example: { header_text: ["#123"] },
    },
    {
      type: "BODY",
      text: "Hola {{1}}, tu pedido llega el {{2}}.",
      example: { body_text: [["Ana", "lunes"]] },
    },
    { type: "FOOTER", text: "Gracias" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Ver pedido" }] },
  ],
} as unknown as TemplateData;

function setup(options: {
  service: "whatsapp" | "instagram" | "local";
  lastIncomingHoursAgo: number;
  template?: boolean;
}) {
  const conv = conversationRow({
    organization_id: ORG_A,
    service: options.service,
    updated_at: "2026-09-10T00:00:00.000Z",
  });
  const incoming = messageRow({
    conversation_id: conv.id,
    timestamp: NOW.subtract(options.lastIncomingHoursAgo, "hour").toISOString(),
  });
  useBoundStore.setState((state) => ({
    ui: {
      ...state.ui,
      activeOrgId: ORG_A,
      activeConvId: conv.id,
      language: "es",
      templatePicker: false,
      templateDrafts: new Map(
        options.template
          ? [
              [
                conv.id,
                { template: TEMPLATE, bodyVarValues: [], headVarValues: [] },
              ],
            ]
          : [],
      ),
    },
    chat: {
      ...state.chat,
      ownAgentId: "agent-alice",
      conversations: new Map([[conv.id, conv]]),
      messages: new Map([[conv.id, new Map([[incoming.id, incoming]])]]),
      textDrafts: new Map(),
      fileDrafts: new Map(),
      membershipExtras: new Map(),
    },
  }));

  render(
    <TickContext.Provider value={NOW}>
      <ChatFooter />
    </TickContext.Provider>,
  );
  return conv;
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  sent.length = 0;
  orgAddresses = [];
});

describe("F29: ChatFooter (characterization)", () => {
  it("WhatsApp inside the window: composer and countdown", async () => {
    setup({ service: "whatsapp", lastIncomingHoursAgo: 2 });
    await settle();
    expect(document.body.innerHTML).toMatchSnapshot();
  });

  it("Instagram inside the window", async () => {
    setup({ service: "instagram", lastIncomingHoursAgo: 23 });
    await settle();
    expect(document.body.innerHTML).toMatchSnapshot();
  });

  it("local: no window", async () => {
    setup({ service: "local", lastIncomingHoursAgo: 72 });
    await settle();
    expect(document.body.innerHTML).toMatchSnapshot();
  });

  it("WhatsApp after the window: closed, and a click opens the template picker", async () => {
    setup({ service: "whatsapp", lastIncomingHoursAgo: 30 });
    await settle();
    expect(document.body.innerHTML).toMatchSnapshot("closed");
    await act(() =>
      fireEvent.click(screen.getAllByText("Conversación cerrada")[0]),
    );
    expect(useBoundStore.getState().ui.templatePicker).toBe(true);
  });

  it("Instagram after the window: closed, no picker", async () => {
    setup({ service: "instagram", lastIncomingHoursAgo: 30 });
    await settle();
    expect(document.body.innerHTML).toMatchSnapshot();
  });

  it("sends a typed text", async () => {
    const conv = setup({ service: "whatsapp", lastIncomingHoursAgo: 1 });
    await settle();
    const editable = document.querySelector("[contenteditable=true]")!;
    editable.innerHTML = "hola <b>mundo</b>";
    await act(() => fireEvent.input(editable));
    await act(() => fireEvent.click(screen.getByTitle("Enviar mensaje")));
    await settle();
    expect(sent).toMatchSnapshot();
    expect(useBoundStore.getState().chat.textDrafts.get(conv.id)).toBe("");
  });

  it("composes and sends a template with header and body variables", async () => {
    const conv = setup({
      service: "whatsapp",
      lastIncomingHoursAgo: 30,
      template: true,
    });
    await settle();
    expect(document.body.innerHTML).toMatchSnapshot("empty template");
    // With no variable typed yet the send button is disabled (it was enabled
    // until the fix after the split: `every` over an empty slice is true).
    expect(
      (screen.getByTitle("Enviar plantilla") as HTMLButtonElement).disabled,
    ).toBe(true);

    const inputs = [...document.querySelectorAll("input[type=text]")];
    const values = ["#987", "Beto", "martes"];
    for (const [i, input] of inputs.entries()) {
      await act(() =>
        fireEvent.change(input, { target: { value: values[i] } }),
      );
    }
    expect(document.body.innerHTML).toMatchSnapshot("filled template");

    await act(() => fireEvent.click(screen.getByTitle("Enviar plantilla")));
    await settle();
    expect(sent).toMatchSnapshot("sent template");
    expect(useBoundStore.getState().ui.templateDrafts.has(conv.id)).toBe(false);
  });

  it("discards a template", async () => {
    const conv = setup({
      service: "whatsapp",
      lastIncomingHoursAgo: 30,
      template: true,
    });
    await settle();
    await act(() => fireEvent.click(screen.getByTitle("Descartar plantilla")));
    expect(useBoundStore.getState().ui.templateDrafts.has(conv.id)).toBe(false);
  });
});

// F28 — a member writing in a conversation whose account's token was
// rejected got no hint: the composer looked normal and every send failed.
describe("F28: ChatFooter warns when the account's token was rejected", () => {
  const AT = "2026-09-15T08:30:00.000Z";

  it("WhatsApp account marked: a compact warning above the composer", async () => {
    orgAddresses = [
      {
        service: "whatsapp",
        address: WA_A,
        organization_id: ORG_A,
        extra: { dispatch_auth_failure: { code: 190, message: "x", at: AT } },
      },
    ];
    setup({ service: "whatsapp", lastIncomingHoursAgo: 2 });
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(new Date(AT).toLocaleString());
    expect(alert).toHaveTextContent("reconectarla");
  });

  it("Instagram account flagged needs_reauth: the same warning", async () => {
    orgAddresses = [
      {
        service: "instagram",
        address: WA_A,
        organization_id: ORG_A,
        extra: { needs_reauth: AT },
      },
    ];
    setup({ service: "instagram", lastIncomingHoursAgo: 2 });
    await settle();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("another account's mark does not warn this conversation", async () => {
    orgAddresses = [
      {
        service: "whatsapp",
        address: "999999999999999",
        organization_id: ORG_A,
        extra: { dispatch_auth_failure: { code: 190, message: "x", at: AT } },
      },
    ];
    setup({ service: "whatsapp", lastIncomingHoursAgo: 2 });
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
