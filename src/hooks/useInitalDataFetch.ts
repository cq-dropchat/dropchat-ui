import {
  supabase,
  type ConversationRow,
  type MessageRow,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { useEffect } from "react";
import { onRecoverySignal } from "@/utils/recoverySignals";
import { observeClient } from "@/utils/telemetry";
import { reportError } from "@/errors/report";
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
    let checkpoint = new Date();
    let running = false;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let initialized = false;
    const active = (signal: AbortSignal) =>
      !signal.aborted &&
      useBoundStore.getState().ui.activeOrgId === orgId &&
      useBoundStore.getState().ui.user?.id === userId;

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
      const catchController = new AbortController();
      const catchSignal = AbortSignal.any([signal, catchController.signal]);
      const tasks = [
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
                .abortSignal(catchSignal)
                .throwOnError()
            ).data,
          (rows) => {
            if (active(catchSignal))
              useBoundStore.getState().chat.pushConversations(rows);
          },
          RECOVERY_PAGE_SIZE,
          { signal: catchSignal },
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
                .abortSignal(catchSignal)
                .throwOnError()
            ).data,
          (rows) => {
            if (active(catchSignal))
              useBoundStore.getState().chat.pushMessages(rows);
          },
          RECOVERY_PAGE_SIZE,
          { signal: catchSignal },
        ),
      ];
      try {
        await Promise.all(tasks);
      } catch (error) {
        catchController.abort();
        await Promise.allSettled(tasks);
        if (error instanceof RecoveryBudgetExceeded && active(signal)) {
          await initData(signal, true);
        } else throw error;
      }
    };
    const cancel = () => {
      controller.abort();
      clearTimeout(retryTimer);
      retryTimer = undefined;
      running = false;
    };
    const recover = async (initial = false) => {
      if (disposed || running || document.visibilityState === "hidden") return;
      clearTimeout(retryTimer);
      controller = new AbortController();
      const signal = controller.signal;
      const since = checkpoint;
      const startedAt = new Date();
      const started = performance.now();
      running = true;
      const diagnostic = (outcome: string) => {
        observeClient(
          initial ? "client.initial" : "client.recovery",
          outcome === "failed" ? "failure" : "success",
          performance.now() - started,
        );
        return window.dispatchEvent(
          new CustomEvent("dropchat:recovery", {
            detail: {
              outcome,
              duration_ms: performance.now() - started,
              attempt,
              release: import.meta.env.VITE_RELEASE,
            },
          }),
        );
      };
      try {
        await Promise.all([
          !initialized || shouldReloadInsteadOfCatchUp(since)
            ? initData(signal, initialized)
            : catchUp(since, signal),
          loadMemberships(signal),
        ]);
        if (!active(signal)) return;
        // Advance only after BOTH tables and memberships converge. The lower
        // bound is the start of the pass, so changes during the pass are replayed.
        checkpoint = startedAt;
        attempt = 0;
        diagnostic(initial ? "initialized" : "recovered");
      } catch (error) {
        if (!active(signal)) return;
        diagnostic("failed");
        reportError(error, {
          event: "client.recovery",
          outcome: "failure",
          attempt,
        });
        retryTimer = setTimeout(
          () => {
            void recover();
          },
          Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)),
        );
      } finally {
        if (controller.signal === signal) running = false;
      }
    };
    const offline = () => {
      cancel();
    };
    const online = () => {
      void recover();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") offline();
      else online();
    };
    const unsubscribe = onRecoverySignal((event) => {
      if (event.organizationId !== orgId || event.userId !== userId) return;
      if (event.state === "reconnected") online();
    });
    void recover(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      cancel();
      unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [orgId, userId]);
};
