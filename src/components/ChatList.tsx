import useBoundStore from "@/stores/useBoundStore";
import ChatListItem from "./ChatListItem";
import { type ConversationRow, type MessageRow } from "@/supabase/client";
import { timestampDescending } from "@/stores/chatSlice";
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
  const membershipExtras = useBoundStore(
    (state) => state.chat.membershipExtras,
  );
  const ownAgentId = useBoundStore((state) => state.chat.ownAgentId);
  const filterName = useBoundStore((state) => state.ui.filter);
  const setFilterName = useBoundStore((state) => state.ui.setFilter);
  const searchPattern = useBoundStore((state) => state.ui.searchPattern);
  const setSearchPattern = useBoundStore((state) => state.ui.setSearchPattern);

  function getMostRecentMsg(convId: string): MessageRow | undefined {
    return messages.get(convId)?.values().next().value;
  }

  let items: ConvMetadata[] = [...conversations]
    /*.filter(
      ([, conv]) =>
        role === "admin" || conv.service !== "local",
    )*/
    .map(([convId, conv]) => ({
      convId,
      conv,
      mostRecentMsg: getMostRecentMsg(convId),
    }))
    .filter(
      (a) =>
        a.conv.organization_id === activeOrgId &&
        filters[filterName](
          a.conv,
          a.mostRecentMsg,
          membershipExtras.get(a.convId),
          ownAgentId,
        ) &&
        !!a.mostRecentMsg,
    );

  if (searchPattern) {
    const fuse = new Fuse(items, {
      threshold: 0.4,
      keys: ["conv.name", "conv.address"],
    });
    items = fuse.search(searchPattern).map((r) => r.item);
  } else {
    items.sort(
      (a, b) =>
        pinnedAscending(
          membershipExtras.get(a.convId)?.pinned,
          membershipExtras.get(b.convId)?.pinned,
        ) || timestampDescending(a.mostRecentMsg, b.mostRecentMsg),
    );
  }

  const itemIds = items.map((a) => a.convId);

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
