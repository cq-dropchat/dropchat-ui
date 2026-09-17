import type {
  InstagramOrganizationAddressExtra,
  WhatsAppOrganizationAddressExtra,
} from "@/supabase/client";

// F28: an account whose token the provider rejected. Its outgoing messages
// fail at once (the dispatcher does not call Meta) until it is reconnected:
// WhatsApp marks `extra.dispatch_auth_failure`, Instagram `extra.needs_reauth`.

export type AccountAuthFailure = { at: string; message?: string };

type AddressLike = { service: string; extra: unknown } | null | undefined;

export function accountAuthFailure(
  address: AddressLike,
): AccountAuthFailure | null {
  if (!address) return null;

  if (address.service === "whatsapp") {
    const mark = (address.extra as WhatsAppOrganizationAddressExtra | null)
      ?.dispatch_auth_failure;
    return mark?.at ? { at: mark.at, message: mark.message } : null;
  }

  if (address.service === "instagram") {
    const at = (address.extra as InstagramOrganizationAddressExtra | null)
      ?.needs_reauth;
    return at ? { at } : null;
  }

  return null;
}

export function formatAuthFailureDate(at: string): string {
  return new Date(at).toLocaleString();
}
