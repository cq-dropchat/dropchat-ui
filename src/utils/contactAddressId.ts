import type { ContactAddressRow } from "@/supabase/client";
/** A connection-scoped contact primary key encoded as one route segment. */
export function addressId(
  row: Pick<ContactAddressRow, "service" | "organization_address" | "address">,
) {
  return [row.service, row.organization_address, row.address].join("~");
}
