import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import ChatFooter from "./ChatFooter";
import SimulatorBar from "./SimulatorBar";
import useBoundStore from "@/stores/useBoundStore";
import { TickContext } from "@/contexts/useTick";
import { newMessage } from "@/utils/MessageUtils";
import { conversationRow, messageRow, ORG_A } from "@/test/factories";

// S1 — the simulator screen: it sends, it receives, and "Reiniciar" empties
// it.
//
// The screen is deliberately the ORDINARY chat: same composer, same bubbles,
// same agent. Only two things differ, and both are here — the member writes
// as the CUSTOMER (sender_address set, which is what arms the contact
// trigger and so the whole reason a drill reaches the agent at all), and a
// band across the top says so and offers the reset.

const deleted: {
  organization_id?: string;
  service?: string;
  address?: string;
}[] = [];
let deleteResult: { data: { id: string }[]; error: null | Error } = {
  data: [],
  error: null,
};

vi.mock("@/supabase/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/supabase/client")>();

  return {
    ...actual,
    supabase: {
      from: (table: string) => ({
        delete: () => {
          const filters: Record<string, string> = {};
          const chain = {
            eq: (column: string, value: string) => {
              filters[column] = value;
              return chain;
            },
            select: () => {
              deleted.push({
                organization_id: filters.organization_id,
                service: filters.service,
                address: filters.address,
              });
              return Promise.resolve(deleteResult);
            },
          };
          return chain;
        },
        // Nothing else in this file reaches PostgREST; a table that does
        // should fail loudly rather than return undefined.
        select: () => {
          throw new Error(`unexpected select on ${table}`);
        },
      }),
    },
  };
});

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { id: "agent-alice" } }),
}));
vi.mock("@/queries/useOrganizationsAddresses", () => ({
  useOrganizationsAddresses: () => ({ data: [] }),
}));
vi.mock("./TemplatePicker", () => ({
  default: () => <div data-testid="template-picker" />,
}));

// A drill is addressed by its OWNER's agent id, plain: that is how RLS tells
// one member's rehearsal from another's, so any prefix here would be a string
// format spelled in TypeScript and again in SQL.
const OWN_AGENT = "agent-alice";
const SANDBOX_ADDRESS = OWN_AGENT;
const NOW = dayjs("2026-09-20T12:00:00.000Z");

function sandboxConversation() {
  return conversationRow({
    service: "sandbox",
    organization_address: ORG_A,
    address: SANDBOX_ADDRESS,
    name: "Simulador",
  });
}

function seed(conv: ReturnType<typeof conversationRow>, messages = new Map()) {
  useBoundStore.setState((state) => ({
    ui: { ...state.ui, activeOrgId: ORG_A, activeConvId: conv.id },
    chat: {
      ...state.chat,
      ownAgentId: "agent-alice",
      conversations: new Map([[conv.id, conv]]),
      messages: new Map([[conv.id, messages]]),
      textDrafts: new Map(),
      fileDrafts: new Map(),
      membershipExtras: new Map(),
    },
  }));
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  deleted.length = 0;
  deleteResult = { data: [], error: null };
});

describe("S1: the simulator sends as the customer", () => {
  it("authors the row with sender_address, which is what arms the agent", () => {
    const conv = sandboxConversation();

    const record = newMessage(conv, {
      version: "1",
      type: "text",
      kind: "text",
      text: "hola",
    });

    expect(record.sender_address).toBe(SANDBOX_ADDRESS);
    expect(record.service).toBe("sandbox");
    // A conversation that has been to the database is named outright.
    expect(record.conversation_id).toBe(conv.id);
  });

  it("leaves a never-saved drill for the insert trigger to mint", () => {
    // What openSandbox pushes optimistically: no updated_at, because the row
    // does not exist yet. A member holds INSERT on `local` conversations and
    // on nothing else (05-03), so a sandbox conversation cannot be created
    // from the client — it is minted by this very message's trigger, the
    // same way a WhatsApp one is.
    const fresh = { ...sandboxConversation(), updated_at: undefined };

    const record = newMessage(
      fresh as unknown as ReturnType<typeof conversationRow>,
      { version: "1", type: "text", kind: "text", text: "hola" },
    );

    expect(record.conversation_id).toBeUndefined();
    expect(record.sender_address).toBe(SANDBOX_ADDRESS);
  });

  it("still authors every other service on our own side", () => {
    const record = newMessage(conversationRow({ service: "whatsapp" }), {
      version: "1",
      type: "text",
      kind: "text",
      text: "hola",
    });

    expect(record.sender_address).toBeNull();
  });

  it("sends a typed text through the ordinary composer", async () => {
    const conv = sandboxConversation();
    seed(conv);

    render(
      <TickContext.Provider value={NOW}>
        <ChatFooter />
      </TickContext.Provider>,
    );
    await settle();

    const editable = document.querySelector("[contenteditable=true]");

    // No 24-hour window to be outside of: channel_window_open answers true
    // for anything that is not whatsapp or instagram, so the composer is
    // open even though this conversation has never had an inbound message.
    expect(editable).not.toBeNull();

    editable!.innerHTML = "mi pedido llegó roto";
    await act(() => fireEvent.input(editable!));
    await settle();

    expect(useBoundStore.getState().chat.textDrafts.get(conv.id)).toContain(
      "mi pedido",
    );
  });
});

describe("S1: the simulator receives", () => {
  it("shows the agent's reply in the open drill", () => {
    const conv = sandboxConversation();
    const reply = messageRow({
      conversation_id: conv.id,
      service: "sandbox",
      organization_address: ORG_A,
      sender_address: null,
      agent_id: "agent-robot",
      content: {
        version: "1",
        type: "text",
        kind: "text",
        text: "Lamento lo del pedido.",
      },
    });

    seed(conv, new Map([[reply.id, reply]]));

    const stored = useBoundStore
      .getState()
      .chat.messages.get(conv.id)
      ?.get(reply.id);

    expect(stored?.sender_address).toBeNull();
    expect((stored?.content as { text: string }).text).toBe(
      "Lamento lo del pedido.",
    );
  });
});

describe("S1: the band, and Reiniciar", () => {
  it("marks the drill and offers the reset", () => {
    seed(sandboxConversation());
    render(<SimulatorBar />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Estás probando como cliente",
    );
    expect(screen.getByText("Reiniciar")).toBeInTheDocument();
  });

  it("renders nothing on a real conversation", () => {
    seed(conversationRow({ service: "whatsapp" }));
    const { container } = render(<SimulatorBar />);

    expect(container).toBeEmptyDOMElement();
  });

  it("empties the drill: the conversation and its messages leave the store", async () => {
    const conv = sandboxConversation();
    const reply = messageRow({ conversation_id: conv.id, service: "sandbox" });
    seed(conv, new Map([[reply.id, reply]]));
    deleteResult = { data: [{ id: conv.id }], error: null };

    render(<SimulatorBar />);
    await act(() => fireEvent.click(screen.getByText("Reiniciar")));
    await settle();

    // Scoped three ways: this organization, drills only, and MINE only. The
    // address arm is the one that matters — without it the statement would
    // ask for colleagues' drills too, be refused them row by row by the
    // policy, and still report success.
    expect(deleted).toEqual([
      { organization_id: ORG_A, service: "sandbox", address: OWN_AGENT },
    ]);

    const chat = useBoundStore.getState().chat;

    expect(chat.conversations.has(conv.id)).toBe(false);
    expect(chat.messages.has(conv.id)).toBe(false);
  });

  it("leaves a colleague's drill alone, in the store as on the server", async () => {
    const mine = sandboxConversation();
    const theirs = conversationRow({
      service: "sandbox",
      organization_address: ORG_A,
      address: "agent-amber",
      name: "Simulador",
    });

    useBoundStore.setState((state) => ({
      ui: { ...state.ui, activeOrgId: ORG_A, activeConvId: mine.id },
      chat: {
        ...state.chat,
        ownAgentId: OWN_AGENT,
        conversations: new Map([
          [mine.id, mine],
          [theirs.id, theirs],
        ]),
        messages: new Map(),
        textDrafts: new Map(),
        fileDrafts: new Map(),
        membershipExtras: new Map(),
      },
    }));

    // What PostgREST returns is what the policy let through — only mine.
    deleteResult = { data: [{ id: mine.id }], error: null };

    render(<SimulatorBar />);
    await act(() => fireEvent.click(screen.getByText("Reiniciar")));
    await settle();

    const chat = useBoundStore.getState().chat;

    expect(chat.conversations.has(mine.id)).toBe(false);
    // The store forgets what the SERVER deleted, never what the client
    // merely asked about: a colleague's drill survives a reset even if the
    // filter above were ever widened by mistake.
    expect(chat.conversations.has(theirs.id)).toBe(true);
  });
});
