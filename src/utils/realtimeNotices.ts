import type { ConversationRow, MessageRow } from "@/supabase/client";

// F10: what the broadcast channels carry (backend 04-12). A notice names a
// changed row without its columns; the client fetches the rows through
// PostgREST, where RLS applies.
export type RealtimeNotice = {
  table: "messages" | "conversations";
  op: "INSERT" | "UPDATE";
  id: string;
  organization_id: string;
  conversation_id: string;
  updated_at: string;
  status_changed?: string[];
};

export type RealtimeRecord = {
  table: "messages" | "conversations";
  op: "INSERT" | "UPDATE";
  record: MessageRow | ConversationRow;
};

export type NoticeBatcherOptions = {
  /** How long notices are collected before their rows are fetched. */
  windowMs?: number;
  /** Ids per request (keeps the `in (...)` URL short). */
  chunkSize?: number;
  activeOrgId: () => string | null;
  isCurrent?: (notice: RealtimeNotice) => boolean;
  fetchMessages: (ids: string[]) => Promise<MessageRow[]>;
  fetchConversations: (ids: string[]) => Promise<ConversationRow[]>;
  onMessages: (rows: MessageRow[]) => void;
  onConversations: (rows: ConversationRow[]) => void;
  onError?: (error: unknown) => void;
};

/** A single flight, two bounded fetches per chunk, with retryable IDs retained. */
export function createNoticeBatcher(options: NoticeBatcherOptions) {
  const windowMs = options.windowMs ?? 250;
  const chunkSize = Math.max(1, options.chunkSize ?? 100);
  const orgId = options.activeOrgId();
  const pending = {
    messages: new Map<string, RealtimeNotice>(),
    conversations: new Map<string, RealtimeNotice>(),
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let inFlight = false;
  let retryDelay = windowMs;
  const active = () => !disposed && options.activeOrgId() === orgId;
  const schedule = (delay = windowMs) => {
    if (
      active() &&
      !inFlight &&
      !timer &&
      (pending.messages.size || pending.conversations.size)
    )
      timer = setTimeout(() => void flush(), delay);
  };
  async function fetchChunk(table: "messages" | "conversations") {
    const entries = [...pending[table].values()].slice(0, chunkSize);
    const needed = entries.filter((notice) => !options.isCurrent?.(notice));
    for (const notice of entries) pending[table].delete(notice.id);
    if (!needed.length) return true;
    try {
      const ids = needed.map((notice) => notice.id);
      const rows =
        table === "messages"
          ? await options.fetchMessages(ids)
          : await options.fetchConversations(ids);
      if (active() && rows.length) {
        if (table === "messages") options.onMessages(rows as MessageRow[]);
        else options.onConversations(rows as ConversationRow[]);
      }
      return true;
    } catch (error) {
      if (active()) {
        for (const notice of needed)
          if (!pending[table].has(notice.id))
            pending[table].set(notice.id, notice);
        options.onError?.(error);
      }
      return false;
    }
  }
  async function flush() {
    timer = undefined;
    if (!active() || inFlight) return;
    inFlight = true;
    // Conversation rows arrive first, so a new message has context already.
    const convOk = await fetchChunk("conversations");
    const msgOk = active() ? await fetchChunk("messages") : true;
    inFlight = false;
    retryDelay =
      convOk && msgOk
        ? windowMs
        : Math.min(Math.max(250, retryDelay * 2), 5000);
    schedule(retryDelay);
  }
  return {
    push(notice: RealtimeNotice) {
      if (
        !active() ||
        notice.organization_id !== orgId ||
        options.isCurrent?.(notice)
      )
        return;
      if (notice.table !== "messages" && notice.table !== "conversations")
        return;
      pending[notice.table].set(notice.id, notice);
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      pending.messages.clear();
      pending.conversations.clear();
    },
  };
}
