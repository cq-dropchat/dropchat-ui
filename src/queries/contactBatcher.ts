import { supabase, type ContactAddressRow } from "@/supabase/client";

type Key = Pick<
  ContactAddressRow,
  "organization_address" | "service" | "address"
>;
const keyOf = (key: Key) =>
  JSON.stringify([key.organization_address, key.service, key.address]);
const quoted = (value: string) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/** One request for the contacts mounted in the same render, never the directory. */
export function createContactBatcher(orgId: string) {
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<
    string,
    {
      key: Key;
      resolve: (row: ContactAddressRow | null) => void;
      reject: (error: unknown) => void;
    }[]
  >();
  async function flush() {
    timer = undefined;
    if (inFlight) return;
    inFlight = true;
    const entries = [...pending.entries()];
    pending.clear();
    // Sequential chunks bound URL length and concurrency even on large group chats.
    for (let offset = 0; offset < entries.length; offset += 50) {
      const chunk = entries.slice(offset, offset + 50);
      try {
        const filter = chunk
          .map(([, waiters]) => {
            const k = waiters[0].key;
            return `and(organization_address.eq.${quoted(k.organization_address)},service.eq.${quoted(k.service)},address.eq.${quoted(k.address)})`;
          })
          .join(",");
        const { data } = await supabase
          .from("contacts_addresses")
          .select()
          .eq("organization_id", orgId)
          .or(filter)
          .limit(50)
          .throwOnError();
        const indexed = new Map(
          (data as ContactAddressRow[]).map((row) => [keyOf(row), row]),
        );
        for (const [key, waiters] of chunk)
          for (const waiter of waiters)
            waiter.resolve(indexed.get(key) ?? null);
      } catch (error) {
        for (const [, waiters] of chunk)
          for (const waiter of waiters) waiter.reject(error);
      }
    }
    inFlight = false;
    if (pending.size) timer ??= setTimeout(() => void flush(), 0);
  }
  return (key: Key) =>
    new Promise<ContactAddressRow | null>((resolve, reject) => {
      const id = keyOf(key);
      const waiters = pending.get(id) ?? [];
      waiters.push({ key, resolve, reject });
      pending.set(id, waiters);
      if (!inFlight) timer ??= setTimeout(() => void flush(), 0);
    });
}
