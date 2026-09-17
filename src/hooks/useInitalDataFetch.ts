import { supabase } from "@/supabase/client";
import type { ConversationRow, MessageRow } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { useEffect, useRef } from "react";
import {
  afterCursorFilter,
  collectChangesSince,
  RECOVERY_PAGE_SIZE,
  shouldReloadInsteadOfCatchUp,
} from "@/utils/recovery";

type InitDataResponse = {
  conversations: ConversationRow[];
  messages: MessageRow[];
};

export const useInitialDataFetch = () => {
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const userId = useBoundStore((state) => state.ui.user?.id);

  const lastVisibleAt = useRef<Date | null>(null);

  const pushConversations = useBoundStore(
    (state) => state.chat.pushConversations,
  );
  const pushMessages = useBoundStore((state) => state.chat.pushMessages);
  const setOwnAgentId = useBoundStore((state) => state.chat.setOwnAgentId);
  const pushMembershipExtras = useBoundStore(
    (state) => state.chat.pushMembershipExtras,
  );

  // The caller's own agent id and per-conversation state
  // (conversations_agents.extra: archived/pinned/draft).
  const loadMemberships = async () => {
    if (!activeOrgId || !userId) return;

    // F20: these rows carry no organization_id for the store to check, so a
    // response that arrives after the user switched organization (or signed
    // out) is dropped here.
    const stillActive = () => {
      const { ui } = useBoundStore.getState();
      return ui.activeOrgId === activeOrgId && ui.user?.id === userId;
    };

    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("organization_id", activeOrgId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle()
      .throwOnError();

    if (!stillActive()) return;
    setOwnAgentId(agent?.id || null);

    if (!agent) return;

    const { data: memberships } = await supabase
      .from("conversations_agents")
      .select("conversation_id, extra")
      .eq("organization_id", activeOrgId)
      .eq("agent_id", agent.id)
      .throwOnError();

    if (!stillActive()) return;
    pushMembershipExtras(memberships);
  };

  const PHASE1_LIMIT = 200;

  // App init: windowed fetch via RPC (timestamp-based), returns convs + msgs
  const initData = async () => {
    if (!activeOrgId) return;

    // Phase 1: recent messages with chat context
    const { data: phase1 } = await supabase
      .rpc("init_data", {
        p_organization_id: activeOrgId,
        p_limit: PHASE1_LIMIT,
        p_per_conversation: 10,
      })
      .throwOnError();

    const p1 = phase1 as unknown as InitDataResponse;
    pushConversations(p1.conversations);
    pushMessages(p1.messages);

    // Phase 2: older conversations with preview messages
    // Skip if phase 1 returned fewer than the limit (all messages fit)
    if (p1.messages.length >= PHASE1_LIMIT) {
      const oldest = p1.messages[p1.messages.length - 1].timestamp;
      const { data: phase2 } = await supabase
        .rpc("init_data", {
          p_organization_id: activeOrgId,
          p_limit: 100,
          p_per_conversation: 5,
          p_until: oldest,
        })
        .throwOnError();

      const p2 = phase2 as unknown as InitDataResponse;
      pushConversations(p2.conversations);
      pushMessages(p2.messages);
    }
  };

  // Tab-visibility recovery (F13): every change since the tab was hidden,
  // paged by (updated_at, id) — see utils/recovery.ts.
  const loadConvs = async (since: Date) => {
    if (!activeOrgId) return;
    await collectChangesSince(
      since.toISOString(),
      async (cursor) =>
        (
          await supabase
            .from("conversations")
            .select()
            .eq("organization_id", activeOrgId)
            .or(afterCursorFilter(cursor))
            .order("updated_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(RECOVERY_PAGE_SIZE)
            .throwOnError()
        ).data,
      pushConversations,
    );
  };

  const loadMsgs = async (since: Date) => {
    if (!activeOrgId) return;
    await collectChangesSince(
      since.toISOString(),
      async (cursor) =>
        (
          await supabase
            .from("messages")
            .select()
            .eq("organization_id", activeOrgId)
            .or(afterCursorFilter(cursor))
            .order("updated_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(RECOVERY_PAGE_SIZE)
            .throwOnError()
        ).data,
      pushMessages,
    );
  };

  useEffect(() => {
    initData().catch(console.error);
    loadMemberships().catch(console.error);

    lastVisibleAt.current = new Date();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, userId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastVisibleAt.current = new Date();
      } else if (
        document.visibilityState === "visible" &&
        lastVisibleAt.current
      ) {
        if (shouldReloadInsteadOfCatchUp(lastVisibleAt.current)) {
          // A long absence: the init_data window is what the screen shows.
          initData().catch(console.error);
        } else {
          loadConvs(lastVisibleAt.current).catch(console.error);
          loadMsgs(lastVisibleAt.current).catch(console.error);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
