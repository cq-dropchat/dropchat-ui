import { useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import dayjs from "dayjs";
import "dayjs/locale/es";
import "dayjs/locale/pt";
import localizedFormat from "dayjs/plugin/localizedFormat";
dayjs.extend(localizedFormat);
import useBoundStore from "@/stores/useBoundStore";
import Message from "./Message/Message";
import {
  type MessageRow,
  isInternal,
  isMultiParty,
  isTeamChat,
  messageDirection,
} from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentOrganization } from "@/queries/useOrganizations";
import { useCurrentAgent } from "@/queries/useAgents";
import { AVATAR_COLORS } from "@/utils/colors";

type EnvelopeType = { message: MessageRow; first: boolean; last: boolean };
type SeparatorType = { text: string; first: true; last: true; key: string };

/** A row's height before it is measured. */
const ESTIMATED_ROW_HEIGHT = 64;
/** Within this distance of the bottom, the view follows new content. */
const STICK_THRESHOLD = 80;

function Separator({ text }: { text: string }) {
  // TODO: just a placeholder
  const type: string = "date";

  return (
    <div
      className={
        "flex justify-center mb-[12px]" +
        (type === "unread" ? " py-[5px] bg-incoming-chat-bubble/25" : "")
      }
    >
      {/* unreads has rounded-16px px-22px py-0 but I prefer to keep the date style */}
      <div
        className={
          "px-[12px] pt-[4px] pb-[5px] capitalize text-[12px] bg-incoming-chat-bubble rounded-lg text-foreground" +
          (type === "unread" ? "" : " shadow")
        }
      >
        {text}
      </div>
    </div>
  );
}

export default function Chat() {
  // TanStack Virtual keeps its state in a mutable instance; the React
  // Compiler would memoize reads of it and freeze the list.
  "use no memo";
  const activeConvId = useBoundStore((store) => store.ui.activeConvId);
  const messages = Array.from(
    useBoundStore((store) =>
      store.chat.messages.get(store.ui.activeConvId || ""),
    )?.values() || [],
  );

  const { data: org } = useCurrentOrganization();
  const orgName = org?.name || "?";

  const conversation = useBoundStore((store) =>
    store.chat.conversations.get(store.ui.activeConvId || ""),
  );
  const convName = conversation?.name || "?";
  const multiParty = !!conversation && isMultiParty(conversation);
  const teamChat = isTeamChat(conversation);

  const { data: agent } = useCurrentAgent();
  // From the store, not the query, so this and Message agree on the viewer
  // exactly — they decide the same message's side, one render apart otherwise.
  const activeAgentId = useBoundStore((store) => store.chat.ownAgentId);
  const isAdmin = ["admin", "owner"].includes(agent?.role || "");

  const scroller = useRef<HTMLDivElement>(null);

  const { translate: t, currentLanguage } = useTranslation();

  function formatDate(timestamp: string): string {
    const dayjsTs = dayjs(timestamp).locale(currentLanguage);

    const days = dayjs().diff(dayjsTs.startOf("day"), "day", true);

    if (days < 1) return t("hoy");

    if (days < 2) return t("ayer");

    if (days < 7) return dayjsTs.format("dddd"); // Jueves

    return dayjsTs.format("l"); // 9/9/2024
  }

  function getUniqueAgentIds(messages: MessageRow[] | undefined): Set<string> {
    if (!messages) return new Set();

    const agentIds = new Set<string>();

    for (const message of messages) {
      if (message.agent_id) {
        agentIds.add(message.agent_id);
      }
    }

    return agentIds;
  }

  function assignAgentColors(agentIds: Set<string>): Map<string, string> {
    const colorMap = new Map<string, string>();
    let colorIndex = 0;

    // Ensure consistent color assignment by sorting agent IDs
    const sortedAgentIds = Array.from(agentIds).sort();

    for (const agentId of sortedAgentIds) {
      colorMap.set(agentId, AVATAR_COLORS[colorIndex % AVATAR_COLORS.length]);
      colorIndex++;
    }

    return colorMap;
  }

  const colorMap = assignAgentColors(getUniqueAgentIds(messages));

  // Who said this — shown only when it is a question.
  //
  // Outgoing side: a shared inbox has many possible senders, so a colleague's
  // (or the AI's) reply is attributed. Mine never is: my own bubbles are the
  // ones on the right that need no explaining.
  //
  // Incoming side: only where the peer's side can hold more than one party.
  // Contacts have no agent row and so no avatar — they get a sender name from
  // Message instead; this is the attribution for members, which is who the
  // other side is made of in a `local` room or a mirrored Slack channel.
  function getAgentAvatar(
    message: MessageRow,
  ): { agentId: string; color: string } | undefined {
    const agentId = message.agent_id;

    if (!agentId || agentId === activeAgentId) return undefined;

    if (
      messageDirection(message, activeAgentId, teamChat) === "incoming" &&
      !multiParty
    ) {
      return undefined;
    }

    return { agentId, color: colorMap.get(agentId)! };
  }

  function insertDateSeparators(
    chat: MessageRow[],
  ): (EnvelopeType | SeparatorType)[] {
    const _chat = [];

    let prevMsg: EnvelopeType | null = null;

    for (const env of chat.map(
      (message) => ({ message, first: false, last: false }) as EnvelopeType,
    )) {
      if (!prevMsg) {
        env.first = true;
        env.last = true;
      } else if (
        prevMsg.message.agent_id === env.message.agent_id &&
        messageDirection(prevMsg.message, activeAgentId, teamChat) ===
          messageDirection(env.message, activeAgentId, teamChat) &&
        prevMsg.message.sender_address === env.message.sender_address
      ) {
        prevMsg.last = false;
        env.last = true;
      } else if (
        prevMsg.message.agent_id !== env.message.agent_id ||
        messageDirection(prevMsg.message, activeAgentId, teamChat) !==
          messageDirection(env.message, activeAgentId, teamChat) ||
        prevMsg.message.sender_address !== env.message.sender_address
      ) {
        prevMsg.last = true;
        env.first = true;
        env.last = true;
      }

      if (
        !prevMsg ||
        dayjs(prevMsg.message.timestamp).isBefore(env.message.timestamp, "day")
      ) {
        _chat.push({
          text: formatDate(env.message.timestamp),
          first: true,
          last: true,
          // Keyed by the day's first message: stable while messages arrive.
          key: `separator:${env.message.id}`,
        } as SeparatorType);

        if (prevMsg) {
          prevMsg.last = true;
        }

        env.first = true;
      }

      _chat.push(env);

      prevMsg = env;
    }

    return _chat;
  }

  /* Actions that reset the unreads counter
   * ======================================
   *
   *   Inactive conversation
   *   ---------------------
   *   [x] Opening the conversation (conv goes active)
   *   [~] {X new messages} system message, it dissapears when conv goes inactive
   *   [ ] Scroll starts at system message
   *
   *   Active conversations
   *   --------------------
   *   [x] Sending a message
   *   [ ] Scrolling to bottom
   *
   * Scrolling behavior
   * ==================
   *
   * If at bottom, it sticks
   * New outgoing -> goes to bottom
   * New incoming -> stays at place
   *
   * Telegram:
   *   Remembers conv scroll position
   *   Re-activating the conv -> goes to bottom
   */

  // If the role is not admin, then do not show internal messages (tool calls, etc).
  const envelopesAndSeparators = insertDateSeparators(
    messages
      .filter((m) => {
        if (isAdmin) return true;

        // Hide internal messages for non-admin users
        if (isInternal(m)) return false;

        return true;
      })
      .reverse(),
  );

  const rows = envelopesAndSeparators;
  const newest = rows.at(-1);
  const newestMessage = newest && "message" in newest ? newest.message : null;

  // F10: mount only the rows in view. A long thread used to mount a Message —
  // markdown, media hooks, store subscriptions — for every message in it.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => {
      const row = rows[index];
      return "message" in row ? row.message.id : row.key;
    },
    overscan: 10,
    paddingStart: 12,
    paddingEnd: 8,
    // First paint (and jsdom) has no layout yet: assume a screenful, already
    // scrolled to the bottom, where a conversation opens.
    initialRect: { width: 0, height: 800 },
    initialOffset: () => rows.length * ESTIMATED_ROW_HEIGHT,
  });

  // Scroll anchoring works from geometry, not from scroll events (which a
  // background tab does not dispatch): the view "is at the bottom" when it was
  // within STICK_THRESHOLD of the content height from BEFORE the latest
  // change. Every effect below runs after new content has already grown
  // scrollHeight, so the current height would say "not at the bottom" for a
  // reader who was.
  const heightBefore = useRef(0);
  const wasAtBottom = () => {
    const el = scroller.current;
    return (
      !!el &&
      heightBefore.current - el.scrollTop - el.clientHeight < STICK_THRESHOLD
    );
  };

  // The effects run on their own triggers (conversation, newest message,
  // content size, viewport); this ref hands them this render's rows.
  const scrollToBottom = useRef(() => {});
  scrollToBottom.current = () => {
    if (rows.length) {
      virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
    }
  };

  // Opening a conversation: its newest message.
  useLayoutEffect(() => {
    scrollToBottom.current();
    heightBefore.current = scroller.current?.scrollHeight ?? 0;
  }, [activeConvId]);

  // Scrolling behavior (see above): if at the bottom, it sticks; a new
  // outgoing message of mine goes to the bottom; a new incoming one leaves
  // the reader where they are.
  const lastNewestId = useRef(newestMessage?.id);
  const onNewestMessage = useRef(() => {});
  onNewestMessage.current = () => {
    if (!newestMessage || newestMessage.id === lastNewestId.current) return;
    lastNewestId.current = newestMessage.id;

    const mine = !!activeAgentId && newestMessage.agent_id === activeAgentId;
    if (mine || wasAtBottom()) {
      scrollToBottom.current();
    }
  };
  useLayoutEffect(() => {
    onNewestMessage.current();
  }, [newestMessage?.id]);

  // Rows grow after they mount (measurement, images and media, fonts): a view
  // that was at the bottom stays there. Declared after the effect above, so
  // both judge against the same previous height.
  const totalSize = virtualizer.getTotalSize();
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (wasAtBottom()) {
      el.scrollTop = el.scrollHeight;
    }
    heightBefore.current = el.scrollHeight;
  }, [totalSize]);

  // Adjust scroll when visual viewport resizes (e.g. mobile keyboard opens)
  useEffect(() => {
    const handleResize = () => {
      const el = scroller.current;
      if (
        el &&
        el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD * 4
      ) {
        scrollToBottom.current();
      }
    };

    window.visualViewport?.addEventListener("resize", handleResize);

    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    activeConvId && (
      <div
        ref={scroller}
        className="grow overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                // flex: a flex container holds its children's margins, so the
                // measured height includes a bubble's bottom margin.
                className="absolute top-0 left-0 w-full flex flex-col"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {"message" in row ? (
                  <Message
                    message={row.message}
                    first={row.first}
                    last={row.last}
                    orgName={orgName}
                    convName={convName}
                    multiParty={multiParty}
                    avatar={getAgentAvatar(row.message)}
                  />
                ) : (
                  <Separator text={row.text} />
                )}
              </div>
            );
          })}
        </div>
        {/* (
          <button
            style={{
              width: "42px",
              height: "42px",
              position: "fixed",
              bottom: "75px",
              right: "20px",
              backgroundColor: "#FFFFFF",
              borderRadius: "50%",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
            }}
            onClick={() => scrollToBottom()}
          >
            <ChevronDown className="w-8 h-8 pt-1 text-foreground" />
          </button>
        ) */}
      </div>
    )
  );
}
