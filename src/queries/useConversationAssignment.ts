import { useMutation } from "@tanstack/react-query";
import { supabase, type ConversationRow } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";

/**
 * H6 — moving a conversation's assignment.
 *
 * No table write: the assignment columns are closed to every API role (the
 * guard trigger of H1 refuses them), because a change has to carry its audit
 * note. `assign_conversation` (H3) is the only door, and it decides for
 * itself whether the caller may see the conversation.
 *
 * Nothing is invalidated on success: the row comes back through Realtime like
 * every other change to a conversation, and the store is what the chat reads.
 */
export function useAssignConversation() {
  const pushConversations = useBoundStore(
    (state) => state.chat.pushConversations,
  );

  return useMutation({
    mutationFn: async ({
      conversationId,
      agentId,
    }: {
      conversationId: string;
      /** A member takes it, an AI agent answers it, null returns it to routing. */
      agentId: string | null;
    }) => {
      const { data } = await supabase
        .rpc("assign_conversation", {
          p_conversation_id: conversationId,
          // The generated type says `string | undefined` because the
          // parameter has a default; null is what "back to routing" is.
          p_agent_id: agentId as string,
        })
        .throwOnError();

      // The RPC returns the conversation row; the generated type spells its
      // `extra` as raw Json (the typed Database wrapper only narrows tables).
      return data as unknown as ConversationRow | null;
    },
    onSuccess: (row) => {
      // The Realtime round trip is a second or two; the menu should not feel
      // like it did nothing in the meantime. `pushConversations` keeps the
      // newer row either way (it compares updated_at).
      if (row) pushConversations([row]);
    },
  });
}
