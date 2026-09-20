import type {
  ConversationAgentExtra,
  ConversationRow,
  MessageRow,
} from "@/supabase/client";
import type { AppState } from "./useBoundStore";
import type { StateCreator } from "zustand";
// @ts-expect-error no type declarations for the core-js-pure submodule
import groupByUntyped from "core-js-pure/actual/object/group-by";

// Object.groupBy, polyfilled — it is not in the ES2022 lib this project targets.
const groupBy = groupByUntyped as <T>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => string,
) => Partial<Record<string, T[]>>;
import {
  MEDIA_MEMORY_BUDGET,
  forgetMedia,
  isMediaRetained,
  mediaLastUsed,
  touchMedia,
} from "@/utils/mediaCache";

export function timestampDescending(a?: MessageRow, b?: MessageRow) {
  // Valid comparator: returns a signed number and 0 on ties. The previous
  // version returned only -1/1 (never 0), which is non-antisymmetric for equal
  // timestamps and makes V8's sort produce engine-dependent, unstable order.
  const ta = +new Date(a?.timestamp || 0);
  const tb = +new Date(b?.timestamp || 0);
  if (ta !== tb) return tb - ta;

  // Ties are common: WhatsApp delivers whole-second timestamps, and echoed
  // outgoing messages get their ms-disambiguated timestamp overwritten by
  // Meta's second-resolution one. created_at preserves the true insertion
  // order in those cases; id is the final, fully deterministic fallback.
  const ca = +new Date(a?.created_at || 0);
  const cb = +new Date(b?.created_at || 0);
  if (ca !== cb) return cb - ca;

  return (b?.id || "").localeCompare(a?.id || "");
}

/** Past this many moved rows a full sort beats repeated insertion. */
const INSERTION_LIMIT = 64;

function sameOrderingKey(a: MessageRow, b: MessageRow) {
  return a.timestamp === b.timestamp && a.created_at === b.created_at;
}

/** First index whose row sorts after `row` (newest-first order). */
function insertionIndex(sorted: MessageRow[], row: MessageRow) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (timestampDescending(sorted[mid], row) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * F10. Merges incoming rows into a conversation kept newest-first, without
 * re-sorting it on every realtime event.
 *
 * Four events in five are status updates (sent, delivered, read) on a row the
 * store already has: its ordering key did not change, so the value is swapped
 * in place (Map.set keeps the position). A new message is placed by binary
 * search. Only a first load, or a batch that moves many rows, sorts.
 *
 * Returns a new Map (zustand needs a new reference); the conversation's
 * rows are copied once, O(m), instead of sorted, O(m log m).
 */
export function mergeSortedMessages(
  current: Map<string, MessageRow> | undefined,
  incoming: MessageRow[],
): Map<string, MessageRow> {
  const accepted: MessageRow[] = [];

  for (const msg of incoming) {
    // skip push when the cached msg is more recent than the incoming msg
    const cachedUpdatedAt = current?.get(msg.id)?.updated_at;
    if (
      cachedUpdatedAt &&
      +new Date(cachedUpdatedAt) > +new Date(msg.updated_at)
    ) {
      continue;
    }
    accepted.push(msg);
  }

  if (!current || current.size === 0) {
    const rows = [...new Map(accepted.map((m) => [m.id, m])).values()];
    if (rows.length > 1) rows.sort(timestampDescending);
    return new Map(rows.map((m) => [m.id, m]));
  }

  const moved = new Map<string, MessageRow>();
  const next = new Map(current);

  for (const msg of accepted) {
    const cached = current.get(msg.id);
    if (cached && sameOrderingKey(cached, msg) && !moved.has(msg.id)) {
      next.set(msg.id, msg); // in place
    } else {
      moved.set(msg.id, msg);
    }
  }

  if (moved.size === 0) return next;

  const rows = Array.from(next.values()).filter((m) => !moved.has(m.id));

  if (moved.size > INSERTION_LIMIT) {
    rows.push(...moved.values());
    rows.sort(timestampDescending);
  } else {
    for (const msg of moved.values()) {
      rows.splice(insertionIndex(rows, msg), 0, msg);
    }
  }

  return new Map(rows.map((m) => [m.id, m]));
}

/** The newest row of a conversation (rows are kept newest-first). */
function newestOf(rows: Map<string, MessageRow> | undefined) {
  return rows?.values().next().value as MessageRow | undefined;
}

/**
 * F10. Conversation ids with messages, newest message first — what ChatList
 * used to derive (and sort) on every render.
 */
export function orderConversations(
  messages: Map<string, Map<string, MessageRow>>,
): string[] {
  return [...messages]
    .map(([convId, rows]) => ({ convId, newest: newestOf(rows) }))
    .filter((c) => !!c.newest)
    .sort((a, b) => timestampDescending(a.newest, b.newest))
    .map((c) => c.convId);
}

/**
 * F10. Moves the conversations whose newest message changed to their place
 * in `order`, by binary search on the newest message; past INSERTION_LIMIT
 * it rebuilds. Returns `order` itself when nothing moved.
 */
function reorderConversations(
  order: string[],
  messages: Map<string, Map<string, MessageRow>>,
  changed: Set<string>,
): string[] {
  if (changed.size === 0) return order;
  if (changed.size > INSERTION_LIMIT) return orderConversations(messages);

  const next = order.filter((id) => !changed.has(id));
  for (const convId of changed) {
    const newest = newestOf(messages.get(convId));
    if (!newest) continue;
    let lo = 0;
    let hi = next.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (timestampDescending(newestOf(messages.get(next[mid])), newest) <= 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    next.splice(lo, 0, convId);
  }
  return next;
}

export type FileDraft = {
  file: File;
  caption?: string;
};

export type MediaLoad = {
  blob?: Blob;
  type: "upload" | "download";
  status: "pending" | "loading" | "done" | "error";
  error?: string;
  handledOnce?: boolean;
};

export type ChatState = {
  conversations: Map<string, ConversationRow>;
  // The caller's own agent id in the active org, and their per-conversation
  // state (conversations_agents.extra rows): archived/pinned/draft.
  ownAgentId: string | null;
  membershipExtras: Map<string, ConversationAgentExtra>;
  /** F10: conversation ids with messages, newest message first. */
  convOrder: string[];
  messages: Map<string, Map<string, MessageRow>>; // TODO: replace the nested maps with a data structure capable of prefix search (a Trie) - cabra 2024/07/26
  /**
   * P6: the root Map above is updated in place — copying it cost
   * O(#conversations) on every realtime event, measured at about 3 ms of the
   * 4 this push took with 50,000 conversations. Its identity therefore no
   * longer says "something changed": this counter does.
   *
   * A subscriber that follows one conversation keeps selecting
   * `messages.get(convId)`, whose identity still changes only when that
   * conversation's rows do; one that has to react to any message at all
   * (ChatList, whose filters read every conversation's newest row) reads
   * this instead.
   */
  messagesVersion: number;
  textDrafts: Map<string, string>;
  fileDrafts: Map<string, FileDraft[]>;
  mediaLoads: Map<string, MediaLoad>;
};

export type ChatActions = {
  pushConversations: (convs: ConversationRow[]) => void;
  setOwnAgentId: (agentId: string | null) => void;
  setMembershipExtra: (
    convId: string,
    extra: Partial<ConversationAgentExtra>,
  ) => void;
  pushMembershipExtras: (
    rows: { conversation_id: string; extra: ConversationAgentExtra | null }[],
  ) => void;
  pushMessages: (msgs: MessageRow[]) => void;
  /**
   * S1 — forgets conversations the server no longer has. The first thing in
   * this app that removes one: until the simulator's "Reiniciar" there was
   * no way to delete a conversation at all, so the store only ever grew.
   *
   * Everything keyed by the id goes with it, or the next push would rebuild
   * a thread out of the leftovers.
   */
  removeConversations: (ids: string[]) => void;
  setMediaLoad: (messageId: string, mediaLoad: MediaLoad) => void;
  setConversationTextDraft: (convId: string, textDraft: string) => void;
  setConversationFileDrafts: (convId: string, drafts: FileDraft[]) => void;
  setConversationFileDraftCaption: (
    convId: string,
    draftIndex: number,
    caption: string,
  ) => void;
};

export type ChatSlice = ChatState & ChatActions;

/**
 * F20: the chat slice holds one organization's data for one user. Switching
 * organization or user starts from this (see uiSlice.setActiveOrg/setUser).
 */
export function emptyChatState(): ChatState {
  return {
    conversations: new Map(),
    ownAgentId: null,
    membershipExtras: new Map(),
    messages: new Map(),
    messagesVersion: 0,
    convOrder: [],
    textDrafts: new Map(),
    fileDrafts: new Map(),
    mediaLoads: new Map(),
  };
}

/**
 * F20: rows reach the store from requests and Realtime events that can
 * outlive an organization switch or a sign-out. Only the active
 * organization's rows are kept.
 */
function ofActiveOrg<T extends { organization_id: string }>(
  rows: T[],
  activeOrgId: string | null,
): T[] {
  return activeOrgId
    ? rows.filter((row) => row.organization_id === activeOrgId)
    : [];
}

/**
 * F21: an upload keeps its file until it is done (it is the only copy); a
 * blob a mounted message shows stays. Anything else can be downloaded again,
 * or read back from the disk cache.
 */
function evictable(messageId: string, load: MediaLoad) {
  return (
    !!load.blob &&
    !(load.type === "upload" && load.status !== "done") &&
    !isMediaRetained(messageId)
  );
}

/**
 * F21: drops the least recently used blobs until the rest fit the budget.
 * The entry goes with its blob, so the message is back to "pending".
 * Mutates the Map it is given (a copy made by the caller).
 */
export function evictMediaLoads(
  mediaLoads: Map<string, MediaLoad>,
  budget: number,
) {
  let total = 0;
  for (const load of mediaLoads.values()) total += load.blob?.size ?? 0;
  if (total <= budget) return;

  const candidates = [...mediaLoads]
    .filter(([id, load]) => evictable(id, load))
    .sort(([a], [b]) => mediaLastUsed(a) - mediaLastUsed(b));

  for (const [id, load] of candidates) {
    if (total <= budget) break;
    mediaLoads.delete(id);
    forgetMedia(id);
    total -= load.blob!.size;
  }
}

// @ts-expect-error partializing the slice creator's state type
export const createChatSlice: StateCreator<Partial<AppState>> = (
  set: (
    partial:
      | AppState
      | Partial<AppState>
      | ((state: AppState) => AppState | Partial<AppState>),
    replace?: boolean,
  ) => void,
) => ({
  ...emptyChatState(),
  setOwnAgentId: (agentId: string | null) =>
    set((state) => ({ chat: { ...state.chat, ownAgentId: agentId } })),
  setMembershipExtra: (
    convId: string,
    extra: Partial<ConversationAgentExtra>,
  ) =>
    set((state) => {
      const membershipExtras = new Map(state.chat.membershipExtras);
      membershipExtras.set(convId, {
        ...membershipExtras.get(convId),
        ...extra,
      });
      return { chat: { ...state.chat, membershipExtras } };
    }),
  pushMembershipExtras: (
    rows: { conversation_id: string; extra: ConversationAgentExtra | null }[],
  ) =>
    set((state) => {
      const membershipExtras = new Map(state.chat.membershipExtras);
      for (const row of rows) {
        membershipExtras.set(row.conversation_id, row.extra || {});
      }
      return { chat: { ...state.chat, membershipExtras } };
    }),
  pushConversations: (convs: ConversationRow[]) =>
    set((state) => {
      const conversations = new Map(state.chat.conversations);

      for (const conv of ofActiveOrg(convs, state.ui.activeOrgId)) {
        // skip push when the cached conv is more recent than the incoming conv
        const cachedUpdatedAt = conversations.get(conv.id)?.updated_at;

        if (
          cachedUpdatedAt &&
          +new Date(cachedUpdatedAt) > +new Date(conv.updated_at)
        ) {
          continue;
        }

        conversations.set(conv.id, conv);
      }

      return {
        chat: {
          ...state.chat,
          conversations,
        },
      };
    }),
  removeConversations: (ids: string[]) =>
    set((state) => {
      const conversations = new Map(state.chat.conversations);
      const messages = new Map(state.chat.messages);
      const membershipExtras = new Map(state.chat.membershipExtras);
      const textDrafts = new Map(state.chat.textDrafts);
      const fileDrafts = new Map(state.chat.fileDrafts);

      for (const id of ids) {
        conversations.delete(id);
        messages.delete(id);
        membershipExtras.delete(id);
        textDrafts.delete(id);
        fileDrafts.delete(id);
      }

      return {
        chat: {
          ...state.chat,
          conversations,
          messages,
          membershipExtras,
          textDrafts,
          fileDrafts,
          // The virtualized list reads this to know the thread changed
          // underneath it; without the bump a reset leaves the old rows on
          // screen until something else happens to write a message.
          messagesVersion: state.chat.messagesVersion + 1,
        },
      };
    }),
  pushMessages: (incoming: MessageRow[]) =>
    set((state) => {
      // P3 (§5.2): contents that predate the v1 schema used to be converted
      // here. `messages_content_schema` is validated now, so the database
      // holds none — and a shape this build does not know (a `{}` awaiting
      // its content, a version it predates) is dropped rather than guessed
      // at, which is what the converter did with those all along.
      const msgs = ofActiveOrg(incoming, state.ui.activeOrgId).filter(
        (m) => m.content.version === "1",
      );

      // P6: kept in place. Every subscriber reads through `chat`, which is a
      // new object on every set, so the root Map's identity was buying
      // nothing but a copy of one entry per conversation on every event.
      // What changed is announced by `messagesVersion` and, for whoever
      // follows a single conversation, by that conversation's own Map.
      const messages = state.chat.messages;

      const msgsByConv = groupBy(
        msgs.filter((m) => m.timestamp <= m.updated_at), // do not display scheduled messages (timestamp in the future)
        (msg: MessageRow) => msg.conversation_id,
      );

      // F10: conversations whose newest message moved, for convOrder.
      const changed = new Set<string>();

      for (const [convId, convMsgs] of Object.entries(msgsByConv)) {
        const before = newestOf(messages.get(convId));
        messages.set(
          convId,
          mergeSortedMessages(messages.get(convId), convMsgs!),
        );
        const after = newestOf(messages.get(convId));
        if (
          !before ||
          !after ||
          before.id !== after.id ||
          !sameOrderingKey(before, after)
        ) {
          changed.add(convId);
        }
      }

      return {
        chat: {
          ...state.chat,
          messages,
          messagesVersion: state.chat.messagesVersion + 1,
          convOrder: reorderConversations(
            state.chat.convOrder,
            messages,
            changed,
          ),
        },
      };
    }),
  setMediaLoad: (messageId: string, mediaLoad: MediaLoad) => {
    set((state) => {
      const mediaLoads = new Map(state.chat.mediaLoads);

      if (mediaLoad.blob !== mediaLoads.get(messageId)?.blob) {
        touchMedia(messageId);
      }
      mediaLoads.set(messageId, { ...mediaLoad });
      evictMediaLoads(mediaLoads, MEDIA_MEMORY_BUDGET);

      return {
        chat: {
          ...state.chat,
          mediaLoads,
        },
      };
    });
  },
  setConversationTextDraft: (convId: string, textDraft: string) => {
    set((state) => {
      const textDrafts = new Map(state.chat.textDrafts);

      textDrafts.set(convId, textDraft);

      return {
        chat: {
          ...state.chat,
          textDrafts,
        },
      };
    });
  },
  setConversationFileDrafts: (convId: string, fileDraftArray: FileDraft[]) => {
    set((state) => {
      const fileDrafts = new Map(state.chat.fileDrafts);

      fileDrafts.set(convId, fileDraftArray);

      return {
        chat: {
          ...state.chat,
          fileDrafts,
        },
      };
    });
  },
  setConversationFileDraftCaption: (
    convId: string,
    draftIndex: number,
    caption: string,
  ) => {
    set((state) => {
      const fileDrafts = new Map(state.chat.fileDrafts);

      const draft =
        fileDrafts.get(convId) && fileDrafts.get(convId)![draftIndex];

      if (!draft) {
        return {};
      }

      const fileDraftsArray = Array.from(fileDrafts.get(convId)!);

      fileDraftsArray[draftIndex] = { ...draft, caption };

      fileDrafts.set(convId, fileDraftsArray);

      return {
        chat: {
          ...state.chat,
          fileDrafts,
        },
      };
    });
  },
});
