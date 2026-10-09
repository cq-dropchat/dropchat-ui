import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  supabase,
  type ConversationRow,
  type MessageRow,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { observeClient } from "@/utils/telemetry";
import { queryKeys } from "@/queries/queryKeys";

export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_MAX_PAGES = 20;
type HistoryCursor = { timestamp: string; id: string; newer?: boolean };
type HistoryPage = {
  messages: MessageRow[];
  conversation: ConversationRow | null;
  atLatest: boolean;
};

/** The inbox window is only a preview; opening a chat loads its own history. */
export function useConversationHistory() {
  const queryClient = useQueryClient();
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
    maxPages: HISTORY_MAX_PAGES,
    gcTime: 60_000,
    initialPageParam: null as HistoryCursor | null,
    queryFn: async ({ pageParam, signal }): Promise<HistoryPage> => {
      const started = performance.now();
      try {
        const request = supabase
          .from("messages")
          .select()
          .eq("organization_id", orgId!)
          .eq("conversation_id", convId!)
          .lte("timestamp", new Date().toISOString())
          .order("timestamp", { ascending: !!pageParam?.newer })
          .order("id", { ascending: !!pageParam?.newer })
          .limit(HISTORY_PAGE_SIZE)
          .abortSignal(signal);

        if (pageParam) {
          // Keep full database precision and include the ID: WhatsApp often
          // gives many messages the same whole-second timestamp.
          const op = pageParam.newer ? "gt" : "lt";
          request.or(
            `timestamp.${op}."${pageParam.timestamp}",and(timestamp.eq."${pageParam.timestamp}",id.${op}.${pageParam.id})`,
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

        observeClient("client.history", "success", performance.now() - started);
        return {
          messages: (pageParam?.newer
            ? messages.data.reverse()
            : messages.data) as MessageRow[],
          conversation: conversation.data as ConversationRow | null,
          atLatest:
            !pageParam ||
            (!!pageParam.newer && messages.data.length < HISTORY_PAGE_SIZE),
        };
      } catch (error) {
        if (!signal.aborted)
          observeClient(
            "client.history",
            "failure",
            performance.now() - started,
          );
        throw error;
      }
    },
    getPreviousPageParam: (page) => {
      if (page.atLatest || !page.messages.length) return undefined;
      const newest = page.messages[0];
      return { timestamp: newest.timestamp, id: newest.id, newer: true };
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
    // Retain at most five recently opened histories in the query cache.
    const histories = queryClient
      .getQueryCache()
      .findAll({
        predicate: (query) =>
          query.queryKey[1] === "conversation_history" &&
          query.queryKey[2] !== convId,
      })
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    for (const old of histories.slice(4))
      queryClient.removeQueries({ queryKey: old.queryKey, exact: true });
    return () => {
      const { ui, chat } = useBoundStore.getState();
      if (convId && ui.activeOrgId === orgId && ui.user?.id === userId)
        chat.releaseHistory(convId);
    };
  }, [orgId, convId, userId, queryClient]);

  useEffect(() => {
    const { ui } = useBoundStore.getState();
    if (ui.activeOrgId !== orgId || ui.user?.id !== userId) return;
    for (const page of query.data?.pages ?? []) {
      if (applied.current.has(page)) continue;
      if (page.conversation) pushConversations([page.conversation]);
      pushMessages(page.messages);
      applied.current.add(page);
    }
    if (query.data?.pages.length && convId)
      useBoundStore.getState().chat.setHistoryWindow(
        convId,
        query.data.pages.flatMap((page) => page.messages),
        query.hasPreviousPage,
      );
    const count = query.data?.pages.length ?? 0;
    setAppliedPages((previous) =>
      previous.scope === scope
        ? { scope, count: previous.count + (count ? 1 : 0) }
        : { scope, count },
    );
  }, [
    query.data,
    query.hasPreviousPage,
    orgId,
    convId,
    userId,
    scope,
    pushConversations,
    pushMessages,
  ]);

  return {
    hasOlder: query.hasNextPage,
    hasNewer: query.hasPreviousPage,
    loadNewer: query.fetchPreviousPage,
    pageCount: appliedPages.scope === scope ? appliedPages.count : 0,
    isLoading: enabled && query.isFetching,
    error: query.error,
    loadOlder: query.fetchNextPage,
    retry: query.isFetchPreviousPageError
      ? query.fetchPreviousPage
      : query.isFetchNextPageError
        ? query.fetchNextPage
        : query.refetch,
  };
}
