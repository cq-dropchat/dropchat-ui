// Dev-only harness for the virtualized Chat (F10): the real component and
// store, a synthetic thread, no sign-in. Served by `vite` at /dev/chat.html;
// `vite build` only bundles index.html, so it never ships.
//
// ?count=3000 sets the thread length.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/global.css";
import Chat from "@/components/Chat";
import useBoundStore from "@/stores/useBoundStore";
import type { ConversationRow, MessageRow } from "@/supabase/client";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const CONV = "c0000000-0000-4000-8000-00000000da7a";
const ME = "aaaaaaaa-0000-4000-8000-00000000a0a1";
const CONTACT = "5491100000101";
const WA = "100000000000001";

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";

let seq = 0;

function message(timestamp: number, mine: boolean): MessageRow {
  seq += 1;
  const id = `d0000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  const iso = new Date(timestamp).toISOString();
  return {
    id,
    organization_id: ORG,
    conversation_id: CONV,
    external_id: `wamid.${id}`,
    agent_id: mine ? ME : null,
    service: "whatsapp",
    organization_address: WA,
    thread_id: null,
    conversation_address: CONTACT,
    sender_address: mine ? null : CONTACT,
    content: {
      version: "1",
      type: "text",
      kind: "text",
      // Varied lengths: rows of 1 to ~8 lines, so measuring matters.
      text: `#${seq} ` + LOREM.repeat((seq * 7) % 6),
    },
    status: mine ? { delivered: iso } : { read: iso },
    timestamp: iso,
    created_at: iso,
    updated_at: iso,
  } as MessageRow;
}

/**
 * H6: an assignment note, as the database writes it (H1). The harness is the
 * only place these can be looked at in a browser without signing in.
 */
function assignmentNote(timestamp: number, data: Record<string, unknown>) {
  const row = message(timestamp, true);

  return {
    ...row,
    status: {},
    content: {
      version: "1",
      type: "data",
      kind: "assignment",
      internal: true,
      data,
    },
  } as unknown as MessageRow;
}

/**
 * A structured part a contact can send — a place, a cart, a contact card.
 * Same reason as the note above: these render as cards now, and the harness
 * is where a card can be looked at without a real conversation carrying one.
 */
function dataRow(
  timestamp: number,
  kind: string,
  data: unknown,
  text?: string,
) {
  const row = message(timestamp, false);

  return {
    ...row,
    content: { version: "1", type: "data", kind, data, text },
  } as unknown as MessageRow;
}

const count = Number(new URLSearchParams(location.search).get("count")) || 3000;
const start = Date.now() - count * 60_000;
const rows = [
  ...Array.from({ length: count }, (_, i) =>
    message(start + i * 60_000, i % 3 === 0),
  ),
  assignmentNote(Date.now() - 120_000, {
    from: null,
    to: ME,
    awaiting_human: false,
    by: null,
    cause: "entry",
  }),
  assignmentNote(Date.now() - 60_000, {
    from: ME,
    to: null,
    awaiting_human: true,
    by: ME,
    cause: "escalation",
    category: "reclamo",
    reason: "el pedido llegó dañado",
  }),
  dataRow(Date.now() - 50_000, "location", {
    name: "Bodega Providencia",
    address: "Av. Providencia 1234, Santiago",
    latitude: -33.4264,
    longitude: -70.6199,
  }),
  dataRow(
    Date.now() - 40_000,
    "order",
    {
      catalog_id: "cat-1",
      product_items: [
        {
          product_retailer_id: "POLERA-M-NEGRA",
          quantity: "2",
          item_price: "12990",
          currency: "CLP",
        },
        {
          product_retailer_id: "JOCKEY-AZUL",
          quantity: "1",
          item_price: "8990",
          currency: "CLP",
        },
      ],
      text: "",
    },
    "Lo necesito para el viernes",
  ),
  dataRow(Date.now() - 30_000, "contacts", [
    {
      name: { formatted_name: "Ana Pérez" },
      phones: [{ phone: "56912345678", type: "CELL" }],
    },
    { name: { formatted_name: "Beto Soto" } },
  ]),
].reverse();

useBoundStore.setState((state) => ({
  ui: { ...state.ui, activeOrgId: ORG, activeConvId: CONV },
  chat: {
    ...state.chat,
    ownAgentId: ME,
    conversations: new Map([
      [
        CONV,
        {
          id: CONV,
          organization_id: ORG,
          service: "whatsapp",
          organization_address: WA,
          address: CONTACT,
          name: "Carla",
          type: "direct",
          extra: null,
          created_at: new Date(start).toISOString(),
          updated_at: new Date().toISOString(),
        } as ConversationRow,
      ],
    ]),
    messages: new Map([[CONV, new Map(rows.map((m) => [m.id, m]))]]),
    convOrder: [CONV],
  },
}));

function push(mine: boolean) {
  const m = message(Date.now(), mine);
  useBoundStore.setState((state) => {
    const current = state.chat.messages.get(CONV) ?? new Map();
    return {
      chat: {
        ...state.chat,
        messages: new Map([[CONV, new Map([[m.id, m], ...current])]]),
      },
    };
  });
}

function Harness() {
  const [, rerender] = useState(0);
  return (
    <div className="flex flex-col h-screen bg-chat">
      <div className="flex gap-2 p-2 bg-background text-foreground text-sm">
        <button id="push-incoming" onClick={() => push(false)}>
          + incoming
        </button>
        <button id="push-outgoing" onClick={() => push(true)}>
          + outgoing (mine)
        </button>
        <button onClick={() => rerender((n) => n + 1)}>refresh</button>
      </div>
      <Chat />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Harness />
    </QueryClientProvider>
  </StrictMode>,
);
