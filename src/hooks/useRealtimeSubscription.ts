import {
  type ConversationRow,
  type MessageRow,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { useEffect } from "react";
import { observeClient } from "@/utils/telemetry";
import { subscriptionObserver } from "@/utils/recoverySignals";
import {
  createNoticeBatcher,
  type RealtimeNotice,
  type RealtimeRecord,
} from "@/utils/realtimeNotices";

// F10: `broadcast` joins the private channels the backend publishes to
// (org:, agent:, conv:) and fetches the rows a notice names in one request
// per 250 ms window. `postgres_changes` is the previous organization-wide
// subscription, kept as the rollback path while broadcast is verified in
// production: set VITE_REALTIME_MODE=broadcast to enable it.
export type RealtimeMode = "postgres_changes" | "broadcast";

export const REALTIME_MODE: RealtimeMode =
  import.meta.env.VITE_REALTIME_MODE === "broadcast"
    ? "broadcast"
    : "postgres_changes";

// Local arrival-to-frame duration only; it is not cross-clock provider lag.
function pushObservedMessages(
  rows: MessageRow[],
  push: (rows: MessageRow[]) => void,
  current: () => boolean,
) {
  const started = performance.now();
  const active = useBoundStore.getState().ui.activeConvId;
  push(rows);
  if (
    document.visibilityState !== "visible" ||
    !rows.some((row) => row.conversation_id === active)
  )
    return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (current() && useBoundStore.getState().ui.activeConvId === active)
        observeClient("client.visible", "success", performance.now() - started);
    }),
  );
}

export const useRealtimeSubscription = (mode: RealtimeMode = REALTIME_MODE) => {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const activeConvId = useBoundStore((state) => state.ui.activeConvId);
  const ownAgentId = useBoundStore((state) => state.chat.ownAgentId);

  const pushConversations = useBoundStore(
    (state) => state.chat.pushConversations,
  );
  const pushMessages = useBoundStore((state) => state.chat.pushMessages);

  // Organization-wide: postgres_changes, or the org: channel.
  useEffect(() => {
    if (!activeOrgId || !userId) return;
    let disposed = false;
    const current = () =>
      !disposed &&
      useBoundStore.getState().ui.activeOrgId === activeOrgId &&
      useBoundStore.getState().ui.user?.id === userId;
    const observe = subscriptionObserver(activeOrgId, userId);

    if (mode === "postgres_changes") {
      const filter = `organization_id=eq.${activeOrgId}`;

      const channel = supabase
        .channel("rialtaim")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations", filter },
          (payload) => {
            // TODO: https://github.com/supabase/supabase/issues/32817
            if (!current() || payload.table !== "conversations") return;
            pushConversations([payload.new as ConversationRow]);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter },
          (payload) => {
            // TODO: https://github.com/supabase/supabase/issues/32817
            if (!current() || payload.table !== "messages") return;
            pushObservedMessages(
              [payload.new as MessageRow],
              pushMessages,
              current,
            );
          },
        );

      channel.subscribe((status) => {
        if (current()) observe(status);
      });

      return () => {
        disposed = true;
        void channel.unsubscribe();
      };
    }

    const batcher = createNoticeBatcher({
      activeOrgId: () => (current() ? activeOrgId : null),
      isCurrent: (notice) => {
        const { chat } = useBoundStore.getState();
        const cached =
          notice.table === "messages"
            ? (chat.messages.get(notice.conversation_id)?.get(notice.id) ??
              chat.previews.get(notice.conversation_id)?.get(notice.id))
            : chat.conversations.get(notice.id);
        return (
          !!cached &&
          (cached.updated_at === notice.updated_at ||
            +new Date(cached.updated_at) > +new Date(notice.updated_at))
        );
      },
      fetchMessages: async (ids) =>
        (
          await supabase
            .from("messages")
            .select()
            .eq("organization_id", activeOrgId)
            .in("id", ids)
            .throwOnError()
        ).data as MessageRow[],
      fetchConversations: async (ids) =>
        (
          await supabase
            .from("conversations")
            .select()
            .eq("organization_id", activeOrgId)
            .in("id", ids)
            .throwOnError()
        ).data as ConversationRow[],
      onMessages: (rows) => {
        if (current()) pushObservedMessages(rows, pushMessages, current);
      },
      onConversations: (rows) => {
        if (current()) pushConversations(rows);
      },
      onError: (error) => console.error("realtime fetch failed", error),
    });

    const channel = supabase
      .channel(`org:${activeOrgId}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, ({ payload }) =>
        batcher.push(payload as RealtimeNotice),
      );
    channel.subscribe((status) => {
      if (current()) observe(status);
    });

    // agent: — conversations only some members see (a personal account, a
    // restricted local or Slack one). Same notices.
    const agentChannel = ownAgentId
      ? supabase
          .channel(`agent:${ownAgentId}`, { config: { private: true } })
          .on("broadcast", { event: "*" }, ({ payload }) =>
            batcher.push(payload as RealtimeNotice),
          )
      : null;
    const observeAgent = subscriptionObserver(activeOrgId, userId);
    agentChannel?.subscribe((status) => {
      if (current()) observeAgent(status);
    });

    return () => {
      disposed = true;
      batcher.dispose();
      void channel.unsubscribe();
      void agentChannel?.unsubscribe();
    };
  }, [activeOrgId, userId, ownAgentId, mode, pushConversations, pushMessages]);

  // conv: — the open conversation's full rows, straight to the store.
  useEffect(() => {
    if (mode !== "broadcast" || !activeOrgId || !activeConvId || !userId)
      return;
    let disposed = false;
    const current = () =>
      !disposed &&
      useBoundStore.getState().ui.activeOrgId === activeOrgId &&
      useBoundStore.getState().ui.user?.id === userId;
    const observe = subscriptionObserver(activeOrgId, userId);

    const channel = supabase
      .channel(`conv:${activeConvId}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, ({ payload }) => {
        const { table, record } = payload as RealtimeRecord;
        if (!current() || record?.organization_id !== activeOrgId) return;
        if (table === "messages")
          pushObservedMessages([record as MessageRow], pushMessages, current);
        else if (table === "conversations") {
          pushConversations([record as ConversationRow]);
        }
      });
    channel.subscribe((status) => {
      if (current()) observe(status);
    });

    return () => {
      disposed = true;
      void channel.unsubscribe();
    };
  }, [
    activeOrgId,
    userId,
    activeConvId,
    mode,
    pushConversations,
    pushMessages,
  ]);
};
