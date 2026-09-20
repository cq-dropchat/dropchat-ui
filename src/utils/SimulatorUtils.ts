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
 * The address the member plays the customer from: their own agent id.
 *
 * Per member, not per organization, because the sandbox account is a shared
 * inbox — a single address would put two colleagues rehearsing at the same
 * time into one thread, answered by one agent, reading each other's turns.
 * A conversation is identified by its address, so one each is all it takes.
 *
 * The id PLAIN, with no `sim:` prefix, and that is the load-bearing part:
 * RLS decides whose drill is whose by this same address
 * (rls.get_own_sandbox_addresses), so a prefix would be a string format
 * spelled here and again in SQL — a vocabulary duplicated by hand across the
 * two repos, which this project already has one of. An id compared to an id
 * has no format to drift.
 *
 * Nothing dispatches it, so it reaches no carrier; it is serialised into the
 * agent's context as the peer's address, where a uuid reads as what it is
 * rather than as a phone number that is not one.
 */
export function simulatorAddress(memberAgentId: string): string {
  return memberAgentId;
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
 * "Reiniciar": throws MY drills away. Messages cascade.
 *
 * Scoped to the caller's own address, and so is the policy behind it — a
 * member cannot delete a colleague's drill even by asking PostgREST
 * directly. The filter here is therefore not the guarantee, it is what makes
 * the button say what it does: without it the statement would silently
 * delete nothing of anyone else's and still report success.
 *
 * A plain DELETE, no RPC: the policy that already covered `local` grew the
 * `sandbox` case.
 */
export async function resetSandbox(
  organizationId: string,
  address: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("service", "sandbox")
    .eq("address", address)
    .select("id");

  if (error) throw error;

  useBoundStore
    .getState()
    .chat.removeConversations((data ?? []).map(({ id }) => id));
}
