//===================================
// Ported from open-bsp-api/.../_shared/types/status_types.ts
// Only the stored status shapes are needed UI-side (no webhook/endpoint status).
//===================================

import type { WebhookError } from "./whatsapp_webhook_payload_types";

/**
 * A receipt that may be per reader. Scalar when ONE party owes it — an
 * external direct chat, where "read" is a single fact owed to the peer. A
 * map keyed by the reader when several can read: contact addresses on
 * external group messages (WhatsApp group participants), agent ids in team
 * chat (each member's own read). The keying follows authorship space —
 * `sender_address` keys for contacts, `agent_id` keys for members.
 *
 * The status merge is recursive merge-patch, so concurrent readers
 * accumulate key by key, and a `null` value retracts one. Readers that only
 * care about direct chats can narrow with `typeof value === "string"`.
 */
export type Receipt = string | Record<string, string>;

export type IncomingStatus = {
  // new Date().toISOString(), or null to retract. `pending` is the arm bit
  // automation reads, and the column default sets it on every insert that
  // omits a status — so a writer describing something already finished (a
  // history replay of a months-old message) has to state the retraction, not
  // merely leave it out.
  pending?: string | null;
  read?: Receipt; // per-member map in team chat; scalar elsewhere
  typing?: string;
  edited?: string; // sender edited the message (Instagram, WhatsApp coexistence)
  deleted?: string; // sender deleted/revoked the message (Instagram, WhatsApp coexistence)
  preprocessing?: string;
  preprocessed?: string;
};

export type OutgoingStatus = {
  pending?: string | null; // as IncomingStatus: null retracts the arm bit
  held_for_quality_assessment?: string;
  accepted?: string;
  sent?: string;
  delivered?: Receipt; // per-participant map on external group messages
  read?: Receipt; // per-participant map on external group messages
  edited?: string; // sender edited the message (Instagram, WhatsApp coexistence)
  deleted?: string; // sender deleted/revoked the message (Instagram, WhatsApp coexistence)
  failed?: string;
  preprocessing?: string;
  preprocessed?: string;
  errors?: WebhookError[];
};
