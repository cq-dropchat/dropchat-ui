import useBoundStore from "@/stores/useBoundStore";
import ChatListItem from "./ChatListItem";
import { type ConversationRow, type MessageRow } from "@/supabase/client";
import { filters, Filters } from "@/stores/uiSlice";
import Fuse from "fuse.js";
import { useTranslation } from "@/hooks/useTranslation";
import { useRef } from "react";
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
  // P6: the root Map is updated in place now, so it is no longer what tells
  // this list that a message arrived. The filters read every conversation's
  // newest row, so the list follows every push, exactly as it did when the
  // copy of the root Map was what re-rendered it.
  useBoundStore((state) => state.chat.messagesVersion);
  const convOrder = useBoundStore((state) => state.chat.convOrder);
  const membershipExtras = useBoundStore(
    (state) => state.chat.membershipExtras,
  );
  const ownAgentId = useBoundStore((state) => state.chat.ownAgentId);
  const filterName = useBoundStore((state) => state.ui.filter);
  const setFilterName = useBoundStore((state) => state.ui.setFilter);
  const searchPattern = useBoundStore((state) => state.ui.searchPattern);
  const setSearchPattern = useBoundStore((state) => state.ui.setSearchPattern);

  // F10: the store keeps conversations ordered by their newest message
  // (convOrder); filters, search and pins work on that order instead of
  // sorting every conversation on every render.
  //
  // P6: one pass over that order, collecting ids. The list only needs ids —
  // each ChatListItem reads its own row — and building a ConvMetadata for
  // every conversation, then filtering it, then mapping it to ids, then
  // walking it again for the pins, cost four passes and 50,000 objects on
  // every render (measured: 5.7 ms of the commit, allocation alone).
  const pinnedIds: string[] = [];
  const restIds: string[] = [];
  const matches = filters[filterName];

  for (const convId of convOrder) {
    const conv = conversations.get(convId);
    if (!conv || conv.organization_id !== activeOrgId) continue;

    const mostRecentMsg: MessageRow | undefined = messages
      .get(convId)
      ?.values()
      .next().value;
    if (!mostRecentMsg) continue;

    const extra = membershipExtras.get(convId);
    if (!matches(conv, mostRecentMsg, extra, ownAgentId)) continue;

    // A search ranks every match the same way, pins included.
    if (extra?.pinned && !searchPattern) pinnedIds.push(convId);
    else restIds.push(convId);
  }

  let itemIds: string[];

  if (searchPattern) {
    // Only a search needs the conversation rows themselves, and only for the
    // matches it is about to rank.
    const items: ConvMetadata[] = restIds.map((convId) => ({
      convId,
      conv: conversations.get(convId)!,
      mostRecentMsg: messages.get(convId)?.values().next().value,
    }));
    const fuse = new Fuse(items, {
      threshold: 0.4,
      keys: ["conv.name", "conv.address"],
    });
    itemIds = fuse.search(searchPattern).map((r) => r.item.convId);
  } else {
    // Pinned first (oldest pin first); a stable sort of the few pinned rows
    // keeps convOrder among equal pins, and the rest stay as they are.
    pinnedIds.sort((a, b) =>
      pinnedAscending(
        membershipExtras.get(a)?.pinned,
        membershipExtras.get(b)?.pinned,
      ),
    );
    itemIds = pinnedIds.length ? [...pinnedIds, ...restIds] : restIds;
  }

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
          {t("Nada por aquí")}
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
