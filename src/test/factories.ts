import type {
  AIAgentRow,
  ConversationRow,
  HumanAgentRow,
  MessageRow,
} from "@/supabase/client";

// Typed row factories. Every id is deterministic-looking and obviously fake;
// override what a test cares about and ignore the rest.

export const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const ORG_B = "bbbbbbbb-0000-4000-8000-000000000001";
export const WA_A = "100000000000001";
export const CONTACT_A1 = "5491100000101";
export const AGENT_ALICE = "aaaaaaaa-0000-4000-8000-00000000a0a1";

let counter = 0;

/** A fresh, stable-format uuid per call (v4-shaped, not random). */
export function nextId(prefix = "cccccccc"): string {
  counter += 1;
  return `${prefix}-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export function conversationRow(
  overrides: Partial<ConversationRow> = {},
): ConversationRow {
  const id = overrides.id ?? nextId("c0000000");
  return {
    id,
    organization_id: ORG_A,
    service: "whatsapp",
    organization_address: WA_A,
    address: CONTACT_A1,
    name: "Carla",
    type: "direct",
    extra: null,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

export function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  const id = overrides.id ?? nextId("d0000000");
  // created_at/updated_at follow the timestamp unless stated: a row whose
  // timestamp is later than its updated_at reads as scheduled and is hidden.
  const timestamp = overrides.timestamp ?? "2026-09-01T10:00:00.000Z";
  return {
    id,
    organization_id: ORG_A,
    conversation_id: overrides.conversation_id ?? nextId("c0000000"),
    external_id: `wamid.${id}`,
    agent_id: null,
    service: "whatsapp",
    organization_address: WA_A,
    thread_id: null,
    conversation_address: CONTACT_A1,
    sender_address: CONTACT_A1, // incoming by default
    content: { version: "1", type: "text", kind: "text", text: "hola" },
    status: { delivered: "2026-09-01T10:00:01.000Z" },
    timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

/** An outgoing (account-authored) text message. */
export function outgoingMessageRow(
  overrides: Partial<MessageRow> = {},
): MessageRow {
  return messageRow({
    sender_address: null,
    agent_id: AGENT_ALICE,
    status: { accepted: "2026-09-01T10:01:00.000Z" },
    ...overrides,
  });
}

export function fileMessageRow(
  overrides: Partial<MessageRow> = {},
  file: Partial<{
    uri: string;
    mime_type: string;
    size: number;
    name: string;
  }> = {},
): MessageRow {
  return messageRow({
    content: {
      version: "1",
      type: "file",
      kind: "image",
      file: {
        uri: `internal://media/organizations/${ORG_A}/attachments/file-1`,
        mime_type: "image/jpeg",
        size: 1024,
        ...file,
      },
    },
    ...overrides,
  });
}

export function agentRow(
  overrides: Partial<HumanAgentRow> = {},
): HumanAgentRow {
  return {
    id: overrides.id ?? nextId("a0000000"),
    organization_id: ORG_A,
    user_id: nextId("e0000000"),
    name: "Alice",
    picture: null,
    role: "member",
    extra: null,
    deleted_at: null,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

export function aiAgentRow(overrides: Partial<AIAgentRow> = {}): AIAgentRow {
  return {
    id: overrides.id ?? nextId("a0000000"),
    organization_id: ORG_A,
    user_id: null,
    name: "Robot A",
    picture: null,
    role: "member",
    extra: { mode: "active", protocol: "chat_completions" },
    deleted_at: null,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}
