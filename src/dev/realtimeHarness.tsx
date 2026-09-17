// Dev-only harness for F10: the real ChatList and store under a synthetic
// stream of Realtime events, in either delivery mode, with no sign-in.
// Served by `vite` at /dev/realtime.html; never bundled by `vite build`.
//
//   ?convs=5000     conversations in the store (2 messages each)
//   &rate=50        events per second (half new messages, half status updates)
//   &seconds=10     how long to run
//   &mode=postgres_changes|broadcast
//
// postgres_changes: each event is the payload Realtime sends for a row
// change (the whole row) and is pushed to the store on its own.
// broadcast: each event is the notice the backend broadcasts; the notice
// batcher collects them for 250 ms and "fetches" the rows from memory (no
// network: what is measured is the client's work, and the bytes the fetch
// would carry). Results land in <pre id="result"> and window.__result.
import {
  Profiler,
  StrictMode,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/global.css";
import ChatList from "@/components/ChatList";
import useBoundStore from "@/stores/useBoundStore";
import { orderConversations } from "@/stores/chatSlice";
import type { ConversationRow, MessageRow } from "@/supabase/client";
import { createNoticeBatcher } from "@/utils/realtimeNotices";

const params = new URLSearchParams(location.search);
const CONVS = Number(params.get("convs")) || 5000;
const RATE = Number(params.get("rate")) || 50;
const SECONDS = Number(params.get("seconds")) || 10;
const MODE =
  params.get("mode") === "broadcast" ? "broadcast" : "postgres_changes";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const WA = "100000000000001";
const TEXT =
  "Hola, ¿tienen stock del modelo que vi ayer? Quería saber también el precio con envío.";

const hex = (n: number, width = 12) => n.toString(16).padStart(width, "0");
const convId = (i: number) => `c0000000-0000-4000-8000-${hex(i)}`;
let msgSeq = 0;

function message(conv: number, at: number, inbound: boolean): MessageRow {
  msgSeq += 1;
  const id = `d0000000-0000-4000-8000-${hex(msgSeq)}`;
  const iso = new Date(at).toISOString();
  return {
    id,
    organization_id: ORG,
    conversation_id: convId(conv),
    external_id: `wamid.${id}`,
    agent_id: null,
    service: "whatsapp",
    organization_address: WA,
    thread_id: null,
    conversation_address: `54911${hex(conv, 8)}`,
    sender_address: inbound ? `54911${hex(conv, 8)}` : null,
    content: { version: "1", type: "text", kind: "text", text: TEXT },
    status: inbound ? { delivered: iso } : { sent: iso, delivered: iso },
    timestamp: iso,
    created_at: iso,
    updated_at: iso,
  } as MessageRow;
}

// Seed: CONVS conversations, 2 messages each, newest first per conversation.
const now = Date.now();
const conversations = new Map<string, ConversationRow>();
const messages = new Map<string, Map<string, MessageRow>>();
for (let i = 0; i < CONVS; i++) {
  const at = now - (i + 1) * 60_000;
  conversations.set(convId(i), {
    id: convId(i),
    organization_id: ORG,
    service: "whatsapp",
    organization_address: WA,
    address: `54911${hex(i, 8)}`,
    name: `Contacto ${i}`,
    type: "direct",
    extra: null,
    created_at: new Date(at).toISOString(),
    updated_at: new Date(at).toISOString(),
  } as ConversationRow);
  const older = message(i, at - 30_000, true);
  const newer = message(i, at, false);
  messages.set(
    convId(i),
    new Map([
      [newer.id, newer],
      [older.id, older],
    ]),
  );
}
useBoundStore.setState((state) => ({
  ui: { ...state.ui, activeOrgId: ORG, activeConvId: null },
  chat: {
    ...state.chat,
    ownAgentId: null,
    conversations,
    messages,
    convOrder: orderConversations(messages),
  },
}));

const renders: number[] = [];
let handlerMs = 0;
let wireBytes = 0;
let fetchBytes = 0;
let events = 0;

const pending = new Map<string, MessageRow>();
const batcher = createNoticeBatcher({
  activeOrgId: () => ORG,
  fetchMessages: (ids) => {
    const rows = ids.map((id) => pending.get(id)!).filter(Boolean);
    fetchBytes += JSON.stringify(rows).length;
    return Promise.resolve(rows);
  },
  fetchConversations: () => Promise.resolve([]),
  onMessages: (rows) => {
    const t0 = performance.now();
    useBoundStore.getState().chat.pushMessages(rows);
    handlerMs += performance.now() - t0;
    for (const r of rows) pending.delete(r.id);
  },
  onConversations: () => {},
});

function nextEvent() {
  const conv = Math.floor(Math.random() * CONVS);
  const current = useBoundStore.getState().chat.messages.get(convId(conv));
  const latest = current?.values().next().value as MessageRow | undefined;
  let row: MessageRow;
  let op: "INSERT" | "UPDATE";
  if (events % 2 === 0 || !latest) {
    row = message(conv, Date.now(), true);
    op = "INSERT";
  } else {
    const iso = new Date().toISOString();
    row = {
      ...latest,
      status: { ...latest.status, read: iso },
      updated_at: iso,
    };
    op = "UPDATE";
  }
  events += 1;

  if (MODE === "postgres_changes") {
    const payload = {
      schema: "public",
      table: "messages",
      commit_timestamp: row.updated_at,
      eventType: op,
      new: row,
      old: op === "UPDATE" ? { id: row.id } : {},
      errors: null,
    };
    wireBytes += JSON.stringify({ event: "postgres_changes", payload }).length;
    const t0 = performance.now();
    useBoundStore.getState().chat.pushMessages([payload.new]);
    handlerMs += performance.now() - t0;
  } else {
    const notice = {
      table: "messages" as const,
      op,
      id: row.id,
      organization_id: ORG,
      conversation_id: row.conversation_id,
      updated_at: row.updated_at,
      ...(op === "UPDATE" ? { status_changed: ["read"] } : {}),
    };
    wireBytes += JSON.stringify({
      type: "broadcast",
      event: "messages",
      payload: notice,
    }).length;
    pending.set(row.id, row);
    const t0 = performance.now();
    batcher.push(notice);
    handlerMs += performance.now() - t0;
  }
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}

// Render + commit time of ChatList that also works in a production build
// (where <Profiler> reports nothing): started when the wrapper renders,
// stopped by a layout effect that runs after ChatList's.
let renderStart = 0;
const timed: number[] = [];

function TimedStart() {
  renderStart = performance.now();
  return null;
}

function TimedEnd() {
  useLayoutEffect(() => {
    timed.push(performance.now() - renderStart);
  });
  return null;
}

function Harness() {
  const [result, setResult] = useState("running…");

  useEffect(() => {
    const warmup = setTimeout(() => {
      renders.length = 0;
      timed.length = 0;
      const started = performance.now();
      const total = RATE * SECONDS;
      // Fires every event that is due, catching up when timers run late (a
      // hidden tab throttles them): the event count stays rate × seconds.
      const pump = setInterval(() => {
        const due = Math.min(
          total,
          Math.floor(((performance.now() - started) / 1000) * RATE),
        );
        while (events < due) nextEvent();
        if (events < total) return;
        clearInterval(pump);
        // Let the last broadcast window flush.
        setTimeout(() => {
          const seconds = (performance.now() - started) / 1000;
          const out = {
            mode: MODE,
            conversations: CONVS,
            rate: RATE,
            events,
            events_per_second: Math.round((events / seconds) * 10) / 10,
            handler_ms_per_event:
              Math.round((handlerMs / events) * 1000) / 1000,
            wire_bytes_per_event: Math.round(wireBytes / events),
            fetched_bytes_per_event: Math.round(fetchBytes / events),
            chatlist_commits: renders.length,
            chatlist_render_ms_total: Math.round(
              renders.reduce((a, b) => a + b, 0),
            ),
            chatlist_render_ms: {
              avg:
                Math.round(
                  (renders.reduce((a, b) => a + b, 0) / (renders.length || 1)) *
                    100,
                ) / 100,
              p95: Math.round(percentile(renders, 95) * 100) / 100,
              max: Math.round(Math.max(0, ...renders) * 100) / 100,
            },
            commits_over_16ms: renders.filter((d) => d > 16).length,
            timed_commits: timed.length,
            timed_render_commit_ms: {
              avg:
                Math.round(
                  (timed.reduce((a, b) => a + b, 0) / (timed.length || 1)) *
                    100,
                ) / 100,
              p95: Math.round(percentile(timed, 95) * 100) / 100,
              max: Math.round(Math.max(0, ...timed) * 100) / 100,
            },
            timed_over_8ms: timed.filter((d) => d > 8).length,
            timed_over_16ms: timed.filter((d) => d > 16).length,
          };
          (window as unknown as { __result: unknown }).__result = out;
          setResult(JSON.stringify(out, null, 2));
        }, 600);
      }, 20);
    }, 1500);

    return () => clearTimeout(warmup);
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="w-[380px] h-full border-r">
        <Profiler
          id="ChatList"
          onRender={(_id, _phase, actualDuration) =>
            renders.push(actualDuration)
          }
        >
          <TimedStart />
          <ChatList />
          <TimedEnd />
        </Profiler>
      </div>
      <pre id="result" className="p-4 text-xs">
        {result}
      </pre>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, enabled: false } },
        })
      }
    >
      <Harness />
    </QueryClientProvider>
  </StrictMode>,
);
