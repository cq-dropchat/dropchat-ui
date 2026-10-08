import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  supabase,
  type ConversationRow,
  type MessageRow,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "@/queries/queryKeys";

export const HISTORY_PAGE_SIZE = 50;
type HistoryCursor = { timestamp: string; id: string };
type HistoryPage = {
  messages: MessageRow[];
  conversation: ConversationRow | null;
};

/** The inbox window is only a preview; opening a chat loads its own history. */
export function useConversationHistory() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const convId = useBoundStore((state) => state.ui.activeConvId);
  const userId = useBoundStore((state) => state.ui.user?.id);
  const pushMessages = useBoundStore((state) => state.chat.pushMessages);
  const pushConversations = useBoundStore(
    (state) => state.chat.pushConversations,
  );
  const applied = useRef(new WeakSet<HistoryPage>());
  const enabled = !!orgId && !!convId && !!userId;
  const scope = `${orgId}:${convId}:${userId}`;
  const [appliedPages, setAppliedPages] = useState({ scope: "", count: 0 });

  const query = useInfiniteQuery({
    queryKey: queryKeys.conversationHistory(orgId, convId, userId),
    enabled,
    initialPageParam: null as HistoryCursor | null,
    queryFn: async ({ pageParam, signal }): Promise<HistoryPage> => {
      const request = supabase
        .from("messages")
        .select()
        .eq("organization_id", orgId!)
        .eq("conversation_id", convId!)
        .lte("timestamp", new Date().toISOString())
        .order("timestamp", { ascending: false })
        .order("id", { ascending: false })
        .limit(HISTORY_PAGE_SIZE)
        .abortSignal(signal);

      if (pageParam) {
        // Keep full database precision and include the ID: WhatsApp often
        // gives many messages the same whole-second timestamp.
        request.or(
          `timestamp.lt."${pageParam.timestamp}",and(timestamp.eq."${pageParam.timestamp}",id.lt.${pageParam.id})`,
        );
      }

      const [messages, conversation] = await Promise.all([
        request.throwOnError(),
        pageParam
          ? Promise.resolve({ data: null })
          : supabase
              .from("conversations")
              .select()
              .eq("organization_id", orgId!)
              .eq("id", convId!)
              .abortSignal(signal)
              .maybeSingle()
              .throwOnError(),
      ]);

      return {
        messages: messages.data as MessageRow[],
        conversation: conversation.data as ConversationRow | null,
      };
    },
    getNextPageParam: (page) => {
      if (page.messages.length < HISTORY_PAGE_SIZE) return undefined;
      const last = page.messages.at(-1)!;
      return { timestamp: last.timestamp, id: last.id };
    },
  });

  useEffect(() => {
    // Revisiting a chat must reapply cached pages if the store was reset
    // while switching organizations or signing out.
    applied.current = new WeakSet();
  }, [orgId, convId, userId]);

  useEffect(() => {
    const { ui } = useBoundStore.getState();
    if (ui.activeOrgId !== orgId || ui.user?.id !== userId) return;
    for (const page of query.data?.pages ?? []) {
      if (applied.current.has(page)) continue;
      if (page.conversation) pushConversations([page.conversation]);
      pushMessages(page.messages);
      applied.current.add(page);
    }
    const count = query.data?.pages.length ?? 0;
    setAppliedPages((previous) =>
      previous.scope === scope && previous.count === count
        ? previous
        : { scope, count },
    );
  }, [
    query.data,
    orgId,
    convId,
    userId,
    scope,
    pushConversations,
    pushMessages,
  ]);

  return {
    hasOlder: query.hasNextPage,
    pageCount: appliedPages.scope === scope ? appliedPages.count : 0,
    isLoading: enabled && query.isFetching,
    error: query.error,
    loadOlder: query.fetchNextPage,
    retry: query.hasNextPage ? query.fetchNextPage : query.refetch,
  };
}
