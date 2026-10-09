import useBoundStore from "@/stores/useBoundStore";
import ChatListItem from "./ChatListItem";
import { type ConversationRow, type MessageRow } from "@/supabase/client";
import { filters, Filters } from "@/stores/uiSlice";
import { useConversationSearch } from "@/hooks/useConversationSearch";
import { useTranslation } from "@/hooks/useTranslation";
import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export type ConvMetadata = {
  convId: string;
  conv: ConversationRow;
  mostRecentMsg?: MessageRow;
};

function pinnedAscending(
  aPin: string | null | undefined,
  bPin: string | null | undefined,
) {
  if (!aPin && !bPin) {
    return 0;
  }

  if (aPin && bPin) {
    return +new Date(aPin) > +new Date(bPin) ? 1 : -1;
  }

  return aPin && !bPin ? -1 : 1;
}

/** A list row's height before it is measured (item + 4 px gap). */
const ESTIMATED_ITEM_HEIGHT = 76;

const ChatList = () => {
  // TanStack Virtual keeps its state in a mutable instance; the React
  // Compiler would memoize reads of it and freeze the list.
  "use no memo";
  const { translate: t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const conversations = useBoundStore((state) => state.chat.conversations);
  const messages = useBoundStore((state) => state.chat.messages);
  const previews = useBoundStore((state) => state.chat.previews);
  // Maps are mutated in place; this version is their explicit invalidation.
  const previewsVersion = useBoundStore((state) => state.chat.previewsVersion);
  const convOrder = useBoundStore((state) => state.chat.convOrder);
  const membershipExtras = useBoundStore(
    (state) => state.chat.membershipExtras,
  );
  const ownAgentId = useBoundStore((state) => state.chat.ownAgentId);
  const filterName = useBoundStore((state) => state.ui.filter);
  const setFilterName = useBoundStore((state) => state.ui.setFilter);
  const searchPattern = useBoundStore((state) => state.ui.searchPattern);
  const setSearchPattern = useBoundStore((state) => state.ui.setSearchPattern);

  const metadataVersion = useBoundStore(
    (state) => state.chat.conversationMetadataVersion,
  );
  const searchable = useMemo(() => {
    void metadataVersion;
    return [...useBoundStore.getState().chat.conversations.values()]
      .filter((conv) => conv.organization_id === activeOrgId)
      .map((conv) => ({ id: conv.id, name: conv.name, address: conv.address }));
  }, [metadataVersion, activeOrgId]);
  const searchIds = useConversationSearch(searchable, searchPattern);
  const itemIds = useMemo(() => {
    void previewsVersion;
    if (searchPattern && searchIds === undefined) return [];
    const pinnedIds: string[] = [];
    const restIds: string[] = [];
    const matches = filters[filterName];
    for (const convId of convOrder) {
      const conv = conversations.get(convId);
      if (!conv || conv.organization_id !== activeOrgId) continue;
      const mostRecentMsg = (previews.get(convId) ?? messages.get(convId))
        ?.values()
        .next().value;
      if (
        !mostRecentMsg ||
        !matches(conv, mostRecentMsg, membershipExtras.get(convId), ownAgentId)
      )
        continue;
      if (membershipExtras.get(convId)?.pinned && !searchPattern)
        pinnedIds.push(convId);
      else restIds.push(convId);
    }
    if (searchIds) {
      const eligible = new Map(restIds.map((id, index) => [id, index]));
      return searchIds
        .filter((result) => eligible.has(result.id))
        .sort(
          (a, b) =>
            a.score - b.score || eligible.get(a.id)! - eligible.get(b.id)!,
        )
        .map((result) => result.id);
    }
    pinnedIds.sort((a, b) =>
      pinnedAscending(
        membershipExtras.get(a)?.pinned,
        membershipExtras.get(b)?.pinned,
      ),
    );
    return pinnedIds.length ? [...pinnedIds, ...restIds] : restIds;
  }, [
    conversations,
    messages,
    previews,
    previewsVersion,
    activeOrgId,
    convOrder,
    membershipExtras,
    ownAgentId,
    filterName,
    searchPattern,
    searchIds,
  ]);

  // F10: mount only the rows in view. An organization with thousands of
  // conversations used to mount a ChatListItem — store subscriptions, queries
  // and all — for every one of them.
  const virtualizer = useVirtualizer({
    count: itemIds.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    getItemKey: (index) => itemIds[index],
    overscan: 8,
    // First paint (and jsdom) has no layout yet: assume a screenful.
    initialRect: { width: 0, height: 800 },
  });

  return (
    <div
      ref={scrollRef}
      data-testid="inbox-list"
      data-inbox-count={conversations.size}
      data-search-pattern={searchPattern}
      className="overflow-y-auto [scrollbar-gutter:stable] w-full h-full pt-[10px] px-[10px]"
    >
      {itemIds.length ? (
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-[4px]"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <ChatListItem itemId={itemIds[row.index]} />
            </div>
          ))}
        </div>
      ) : (
        <div className="h-full flex items-center justify-center flex-col text-foreground text-[15px] mt-[-24px]">
          {searchPattern && searchIds === undefined
            ? t("Cargando...")
            : t("Nada por aquí")}
          {(searchPattern || filterName !== Filters.ALL) && (
            <button
              className="text-[13px] text-primary"
              onClick={() => {
                setSearchPattern("");
                setFilterName(Filters.ALL);
              }}
            >
              {t("remover filtros...")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatList;
