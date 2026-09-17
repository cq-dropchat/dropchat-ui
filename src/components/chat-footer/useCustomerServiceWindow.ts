import { useContext } from "react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import "dayjs/locale/pt";
import useBoundStore from "@/stores/useBoundStore";
import { TickContext } from "@/contexts/useTick";
import {
  type ConversationRow,
  type MessageRow,
  isIncoming,
  isTeamChat,
} from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Whether the user may write in the active conversation, and how long until
 * the window closes. WhatsApp (Cloud API) and Instagram both enforce a 24h
 * customer-service window since the contact's last message; `local`
 * (internal testing) and `whatsapp-web` (unofficial bridge) have no window.
 */
export function useCustomerServiceWindow(conv: ConversationRow | undefined) {
  const tick = useContext(TickContext); // one-minute ticks
  const { currentLanguage } = useTranslation();

  const mostRecentIncoming: MessageRow | undefined = useBoundStore((store) => {
    const msgs = store.chat.messages.get(store.ui.activeConvId || "")?.values();

    if (!msgs) {
      return;
    }

    for (const msg of msgs) {
      if (
        isIncoming(
          msg,
          store.chat.ownAgentId,
          isTeamChat(store.chat.conversations.get(msg.conversation_id)),
        )
      ) {
        return msg;
      }
    }
  });

  const inCSWindow =
    (conv?.service !== "whatsapp" && conv?.service !== "instagram") ||
    tick.isBefore(dayjs(mostRecentIncoming?.timestamp || 0).add(1, "day"));

  // WhatsApp customer service window lasts 24 hours since the last contact's message
  const remaining = tick
    .locale(currentLanguage)
    .to(dayjs(mostRecentIncoming?.timestamp || 0).add(1, "day"), true);

  return { inCSWindow, remaining };
}
