import {
  type ConversationRow,
  type MessageRow,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { useEffect } from "react";
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

export const useRealtimeSubscription = (mode: RealtimeMode = REALTIME_MODE) => {
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const activeConvId = useBoundStore((state) => state.ui.activeConvId);
  const ownAgentId = useBoundStore((state) => state.chat.ownAgentId);

  const pushConversations = useBoundStore(
    (state) => state.chat.pushConversations,
  );
  const pushMessages = useBoundStore((state) => state.chat.pushMessages);

  // Organization-wide: postgres_changes, or the org: channel.
  useEffect(() => {
    if (!activeOrgId) return;

    if (mode === "postgres_changes") {
      const filter = `organization_id=eq.${activeOrgId}`;

      const channel = supabase
        .channel("rialtaim")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations", filter },
          (payload) => {
            // TODO: https://github.com/supabase/supabase/issues/32817
            if (payload.table !== "conversations") return;
            pushConversations([payload.new as ConversationRow]);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter },
          (payload) => {
            // TODO: https://github.com/supabase/supabase/issues/32817
            if (payload.table !== "messages") return;
            pushMessages([payload.new as MessageRow]);
          },
        );

      channel.subscribe();

      return () => {
        void channel.unsubscribe();
      };
    }

    const batcher = createNoticeBatcher({
      activeOrgId: () => useBoundStore.getState().ui.activeOrgId,
      fetchMessages: async (ids) =>
        (await supabase.from("messages").select().in("id", ids).throwOnError())
          .data as MessageRow[],
      fetchConversations: async (ids) =>
        (
          await supabase
            .from("conversations")
            .select()
            .in("id", ids)
            .throwOnError()
        ).data as ConversationRow[],
      onMessages: (rows) => pushMessages(rows),
      onConversations: (rows) => pushConversations(rows),
      onError: (error) => console.error("realtime fetch failed", error),
    });

    const channel = supabase
      .channel(`org:${activeOrgId}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, ({ payload }) =>
        batcher.push(payload as RealtimeNotice),
      );
    channel.subscribe();

    // agent: — conversations only some members see (a personal account, a
    // restricted local or Slack one). Same notices.
    const agentChannel = ownAgentId
      ? supabase
          .channel(`agent:${ownAgentId}`, { config: { private: true } })
          .on("broadcast", { event: "*" }, ({ payload }) =>
            batcher.push(payload as RealtimeNotice),
          )
      : null;
    agentChannel?.subscribe();

    return () => {
      batcher.dispose();
      void channel.unsubscribe();
      void agentChannel?.unsubscribe();
    };
  }, [activeOrgId, ownAgentId, mode, pushConversations, pushMessages]);

  // conv: — the open conversation's full rows, straight to the store.
  useEffect(() => {
    if (mode !== "broadcast" || !activeOrgId || !activeConvId) return;

    const channel = supabase
      .channel(`conv:${activeConvId}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, ({ payload }) => {
        const { table, record } = payload as RealtimeRecord;
        if (record?.organization_id !== useBoundStore.getState().ui.activeOrgId)
          return;
        if (table === "messages") pushMessages([record as MessageRow]);
        else if (table === "conversations") {
          pushConversations([record as ConversationRow]);
        }
      });
    channel.subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [activeOrgId, activeConvId, mode, pushConversations, pushMessages]);
};
