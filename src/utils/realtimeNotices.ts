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
  fetchMessages: (ids: string[]) => Promise<MessageRow[]>;
  fetchConversations: (ids: string[]) => Promise<ConversationRow[]>;
  onMessages: (rows: MessageRow[]) => void;
  onConversations: (rows: ConversationRow[]) => void;
  onError?: (error: unknown) => void;
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Collects notices for `windowMs` and fetches the named rows in one request
 * per table (per chunk). A notice of another organization than the active one
 * is dropped (F20), and so are fetched rows if the organization changed while
 * the request was in flight.
 */
export function createNoticeBatcher(options: NoticeBatcherOptions) {
  const windowMs = options.windowMs ?? 250;
  const chunkSize = options.chunkSize ?? 200;
  let messageIds = new Set<string>();
  let conversationIds = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  async function flush() {
    timer = undefined;
    const org = options.activeOrgId();
    const messages = [...messageIds];
    const conversations = [...conversationIds];
    messageIds = new Set();
    conversationIds = new Set();

    try {
      const [messageRows, conversationRows] = await Promise.all([
        Promise.all(chunks(messages, chunkSize).map(options.fetchMessages)),
        Promise.all(
          chunks(conversations, chunkSize).map(options.fetchConversations),
        ),
      ]);
      if (disposed || options.activeOrgId() !== org) return;
      // Conversations first: a message's conversation may be new.
      const convs = conversationRows.flat();
      if (convs.length) options.onConversations(convs);
      const rows = messageRows.flat();
      if (rows.length) options.onMessages(rows);
    } catch (error) {
      options.onError?.(error);
    }
  }

  return {
    push(notice: RealtimeNotice) {
      if (disposed || notice.organization_id !== options.activeOrgId()) {
        return;
      }
      if (notice.table === "messages") messageIds.add(notice.id);
      else if (notice.table === "conversations") {
        conversationIds.add(notice.id);
      } else return;
      timer ??= setTimeout(() => void flush(), windowMs);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
