import {
  supabase,
  type ConversationRow,
  type MessageRow,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { useEffect } from "react";
import {
  afterCursorFilter,
  collectChangesSince,
  RECOVERY_PAGE_SIZE,
  RecoveryBudgetExceeded,
  shouldReloadInsteadOfCatchUp,
} from "@/utils/recovery";

type InitDataResponse = {
  conversations: ConversationRow[];
  messages: MessageRow[];
};

export const useInitialDataFetch = () => {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const userId = useBoundStore((state) => state.ui.user?.id);

  useEffect(() => {
    if (!orgId || !userId) return;
    let controller = new AbortController();
    let lastVisibleAt = new Date();
    let initialized = false;
    const active = (signal: AbortSignal) =>
      !signal.aborted &&
      useBoundStore.getState().ui.activeOrgId === orgId &&
      useBoundStore.getState().ui.user?.id === userId;
    const report = (error: unknown) => {
      if (!controller.signal.aborted) console.error(error);
    };
    const initData = async (signal: AbortSignal, refreshWindow = false) => {
      // One window avoids splitting tied timestamps between two preview calls.
      const { data } = await supabase
        .rpc("init_data", {
          p_organization_id: orgId,
          p_limit: 300,
          p_per_conversation: 10,
        })
        .abortSignal(signal)
        .throwOnError();
      if (!active(signal)) return;
      const window = data as unknown as InitDataResponse;
      const { chat } = useBoundStore.getState();
      chat.pushConversations(window.conversations);
      chat.pushMessages(window.messages);
      initialized = true;
      // A reload must refresh the open history too, even outside the inbox window.
      const convId = useBoundStore.getState().ui.activeConvId;
      if (refreshWindow && convId) {
        const { data: messages } = await supabase
          .from("messages")
          .select()
          .eq("organization_id", orgId)
          .eq("conversation_id", convId)
          .lte("timestamp", new Date().toISOString())
          .order("timestamp", { ascending: false })
          .order("id", { ascending: false })
          .limit(50)
          .abortSignal(signal)
          .throwOnError();
        if (active(signal))
          useBoundStore.getState().chat.pushMessages(messages as MessageRow[]);
        // Refresh the bounded loaded window too: a burst may exceed catch-up
        // even while the reader is looking at much older messages.
        const ids = [
          ...(useBoundStore.getState().chat.messages.get(convId)?.keys() ?? []),
        ].slice(0, 1000);
        for (let offset = 0; offset < ids.length; offset += 100) {
          signal.throwIfAborted();
          const { data: windowRows } = await supabase
            .from("messages")
            .select()
            .eq("organization_id", orgId)
            .eq("conversation_id", convId)
            .in("id", ids.slice(offset, offset + 100))
            .limit(100)
            .abortSignal(signal)
            .throwOnError();
          if (active(signal))
            useBoundStore
              .getState()
              .chat.pushMessages(windowRows as MessageRow[]);
        }
      }
    };
    const loadMemberships = async (signal: AbortSignal) => {
      const { data: agent } = await supabase
        .from("agents")
        .select("id")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .abortSignal(signal)
        .maybeSingle()
        .throwOnError();
      if (!active(signal)) return;
      useBoundStore.getState().chat.setOwnAgentId(agent?.id || null);
      if (!agent) return;
      const { data } = await supabase
        .from("conversations_agents")
        .select("conversation_id, extra")
        .eq("organization_id", orgId)
        .eq("agent_id", agent.id)
        .abortSignal(signal)
        .throwOnError();
      if (active(signal))
        useBoundStore.getState().chat.pushMembershipExtras(data);
    };
    const catchUp = async (since: Date, signal: AbortSignal) => {
      try {
        await Promise.all([
          collectChangesSince(
            since.toISOString(),
            async (cursor) =>
              (
                await supabase
                  .from("conversations")
                  .select()
                  .eq("organization_id", orgId)
                  .or(afterCursorFilter(cursor))
                  .order("updated_at", { ascending: true })
                  .order("id", { ascending: true })
                  .limit(RECOVERY_PAGE_SIZE)
                  .abortSignal(signal)
                  .throwOnError()
              ).data,
            (rows) => {
              if (active(signal))
                useBoundStore.getState().chat.pushConversations(rows);
            },
            RECOVERY_PAGE_SIZE,
            { signal },
          ),
          collectChangesSince(
            since.toISOString(),
            async (cursor) =>
              (
                await supabase
                  .from("messages")
                  .select()
                  .eq("organization_id", orgId)
                  .or(afterCursorFilter(cursor))
                  .order("updated_at", { ascending: true })
                  .order("id", { ascending: true })
                  .limit(RECOVERY_PAGE_SIZE)
                  .abortSignal(signal)
                  .throwOnError()
              ).data,
            (rows) => {
              if (active(signal))
                useBoundStore.getState().chat.pushMessages(rows);
            },
            RECOVERY_PAGE_SIZE,
            { signal },
          ),
        ]);
      } catch (error) {
        if (error instanceof RecoveryBudgetExceeded && active(signal)) {
          controller.abort();
          controller = new AbortController();
          await initData(controller.signal, true);
        } else throw error;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        controller.abort();
        lastVisibleAt = new Date();
      } else if (document.visibilityState === "visible") {
        controller.abort();
        controller = new AbortController();
        const signal = controller.signal;
        const operation =
          !initialized || shouldReloadInsteadOfCatchUp(lastVisibleAt)
            ? initData(signal, initialized)
            : catchUp(lastVisibleAt, signal);
        void operation.catch((error) => {
          if (!signal.aborted) report(error);
        });
        void loadMemberships(signal).catch((error) => {
          if (!signal.aborted) report(error);
        });
      }
    };
    const signal = controller.signal;
    void initData(signal).catch((error) => {
      if (!signal.aborted) report(error);
    });
    void loadMemberships(signal).catch((error) => {
      if (!signal.aborted) report(error);
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [orgId, userId]);
};
