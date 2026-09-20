import useBoundStore from "@/stores/useBoundStore";
import { supabase } from "@/supabase/client";
import { startConversation } from "./ConversationUtils";

/**
 * S1 — "probar como cliente".
 *
 * Until now the only way to try an agent out was a `local` DM, and `local`
 * is the value every Fase H condition names as its exception: no contact
 * trigger, no welcome message, no escalation, no selection and no
 * assignment. The simulator is a conversation on the organization's
 * `sandbox` account instead, which walks the real path — and goes nowhere:
 * no dispatcher, no read receipt, no webhook (B2).
 */

/**
 * The address the member plays the customer from.
 *
 * Per member, not per organization: the sandbox account is a shared inbox,
 * so a single address would put two colleagues rehearsing at the same time
 * into the same thread, answered by one agent, reading each other's turns.
 * A conversation is identified by its address, so one each is all it takes.
 *
 * Not a phone number and not confusable with one — nothing dispatches it,
 * but it does get serialised into the agent's context, and a string that
 * looks like a real contact there would be a small lie to the model.
 */
export function simulatorAddress(memberAgentId: string): string {
  return `sim:${memberAgentId}`;
}

/**
 * Opens the member's simulator conversation, creating it only if there is
 * not one already. Returns the id to navigate to.
 *
 * Unlike openLocalDirect this never INSERTs the conversation: members hold
 * INSERT on `local` conversations and on nothing else (05-03), so a sandbox
 * row is minted by the first message's trigger — the same way a WhatsApp
 * conversation is. `newMessage` leaves conversation_id undefined for a
 * conversation with no updated_at, which is what lets that happen.
 *
 * The store answers first and the database second, because the initial
 * fetch is windowed by recency: a drill nobody has run in a while is
 * perfectly visible and simply not loaded.
 */
export async function openSandbox(conv: {
  organization_id: string;
  organization_address: string;
  address: string;
  name?: string | null;
}): Promise<string> {
  for (const loaded of useBoundStore.getState().chat.conversations.values()) {
    if (
      loaded.service === "sandbox" &&
      loaded.organization_id === conv.organization_id &&
      loaded.address === conv.address
    ) {
      return loaded.id;
    }
  }

  const { data: existing, error } = await supabase
    .from("conversations")
    .select()
    .eq("organization_id", conv.organization_id)
    .eq("organization_address", conv.organization_address)
    .eq("service", "sandbox")
    .eq("address", conv.address)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    useBoundStore.getState().chat.pushConversations([existing]);

    return existing.id;
  }

  return startConversation({
    organization_id: conv.organization_id,
    organization_address: conv.organization_address,
    service: "sandbox",
    address: conv.address,
    name: conv.name,
  });
}

/**
 * "Reiniciar": throws the drills away. Messages cascade.
 *
 * Organization-wide, as §5 of the spec asks — a member resets every drill in
 * the organization, colleagues' included, not only their own. It is a plain
 * DELETE because the RLS policy that already covered `local` was widened to
 * cover `sandbox`; there is no RPC behind this.
 */
export async function resetSandbox(organizationId: string): Promise<void> {
  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("service", "sandbox")
    .select("id");

  if (error) throw error;

  useBoundStore
    .getState()
    .chat.removeConversations((data ?? []).map(({ id }) => id));
}
