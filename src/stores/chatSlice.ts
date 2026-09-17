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
import { type MessageRowV0, toV1 } from "@/supabase/messages-v0";

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
  messages: Map<string, Map<string, MessageRow>>; // TODO: replace the nested maps with a data structure capable of prefix search (a Trie) - cabra 2024/07/26
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
  pushMessages: (msgsMixedVersions: MessageRow[]) =>
    set((state) => {
      const msgs = ofActiveOrg(msgsMixedVersions, state.ui.activeOrgId)
        .map((m) =>
          m.content.version === "1" ? m : toV1(m as unknown as MessageRowV0),
        )
        .filter(Boolean) as MessageRow[];

      const messages = new Map(state.chat.messages);

      const msgsByConv = groupBy(
        msgs.filter((m) => m.timestamp <= m.updated_at), // do not display scheduled messages (timestamp in the future)
        (msg: MessageRow) => msg.conversation_id,
      );

      for (const [convId, convMsgs] of Object.entries(msgsByConv)) {
        messages.set(
          convId,
          mergeSortedMessages(messages.get(convId), convMsgs!),
        );
      }

      return {
        chat: {
          ...state.chat,
          messages,
        },
      };
    }),
  setMediaLoad: (messageId: string, mediaLoad: MediaLoad) => {
    set((state) => {
      const mediaLoads = new Map(state.chat.mediaLoads);

      mediaLoads.set(messageId, { ...mediaLoad });

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
