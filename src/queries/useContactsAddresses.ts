import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  type ContactAddressInsert,
  type ContactAddressRow,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";
import { createContactBatcher } from "./contactBatcher";
import type { Database } from "@/supabase/db_types";

type Service = Database["public"]["Enums"]["service"];

const loaders = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof createContactBatcher>>
>();
function loaderFor(client: QueryClient, orgId: string, userId: string) {
  let scoped = loaders.get(client);
  if (!scoped) {
    scoped = new Map();
    loaders.set(client, scoped);
  }
  const scope = `${orgId}:${userId}`;
  let loader = scoped.get(scope);
  if (!loader) {
    loader = createContactBatcher(orgId);
    scoped.set(scope, loader);
  }
  return loader;
}

export function useContactAddress(
  orgAddress: string | null | undefined,
  service: Service | null | undefined,
  address: string | null | undefined,
) {
  const client = useQueryClient();
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    // The client owns the loader; it does not change contact identity.
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: queryKeys.contacts.detail(
      orgId,
      orgAddress,
      service,
      address,
      userId,
    ),
    queryFn: () =>
      loaderFor(
        client,
        orgId!,
        userId!,
      )({
        organization_address: orgAddress!,
        service: service!,
        address: address!,
      }),
    enabled: !!userId && !!orgId && !!orgAddress && !!service && !!address,
  });
}

const PAGE_SIZE = 100;
export function useContactsAddresses(search = "") {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.contacts.all(orgId), "directory", userId, search],
    enabled: !!userId && !!orgId,
    initialPageParam: null as ContactAddressRow | null,
    queryFn: async ({ pageParam, signal }) => {
      const request = supabase
        .from("contacts_addresses")
        .select()
        .eq("organization_id", orgId!)
        .order("organization_address")
        .order("service")
        .order("address")
        .limit(PAGE_SIZE)
        .abortSignal(signal);
      const quote = (value: string) =>
        `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
      if (pageParam) {
        const org = quote(pageParam.organization_address),
          service = quote(pageParam.service),
          address = quote(pageParam.address);
        request.or(
          `organization_address.gt.${org},and(organization_address.eq.${org},service.gt.${service}),and(organization_address.eq.${org},service.eq.${service},address.gt.${address})`,
        );
      }
      if (search.trim()) {
        const pattern = quote(
          `*${search.trim().replaceAll("*", "").replaceAll("%", "")}*`,
        );
        // Separate AND group from the page's OR cursor.
        request.or(
          `address.ilike.${pattern},extra->>name.ilike.${pattern},extra->synced->>name.ilike.${pattern}`,
        );
      }
      return (await request.throwOnError()).data as ContactAddressRow[];
    },
    getNextPageParam: (page) =>
      page.length === PAGE_SIZE ? page.at(-1) : undefined,
  });
  return {
    data: query.data?.pages.flat(),
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetching: query.isFetching,
    error: query.error,
    isLoading: query.isLoading,
  };
}

export function useCreateContactAddress() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (data: Omit<ContactAddressInsert, "organization_id">) => {
      if (!orgId) throw new Error("No active organization");

      const { data: row } = await supabase
        .from("contacts_addresses")
        .insert({ ...data, organization_id: orgId })
        .select()
        .single()
        .throwOnError();

      return row;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.all(orgId),
      });
    },
  });
}

// Only non-synced entries are the member's to write: a synced one mirrors the
// service's address book and RLS refuses the update.
export function useUpdateContactAddress() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (
      data: Pick<
        ContactAddressRow,
        "organization_address" | "service" | "address"
      > &
        Pick<ContactAddressInsert, "extra" | "status">,
    ) => {
      if (!orgId) throw new Error("No active organization");

      const { organization_address, service, address, ...patch } = data;

      const { data: row } = await supabase
        .from("contacts_addresses")
        .update(patch)
        .eq("organization_id", orgId)
        .eq("organization_address", organization_address)
        .eq("service", service)
        .eq("address", address)
        .select()
        .single()
        .throwOnError();

      return row;
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.all(orgId),
      });
      queryClient.setQueryData(
        queryKeys.contacts.detail(
          orgId,
          row.organization_address,
          row.service,
          row.address,
          useBoundStore.getState().ui.user?.id,
        ),
        row,
      );
    },
  });
}

export function useDeleteContactAddress() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (
      data: Pick<
        ContactAddressRow,
        "organization_address" | "service" | "address"
      >,
    ) => {
      if (!orgId) throw new Error("No active organization");

      await supabase
        .from("contacts_addresses")
        .delete()
        .eq("organization_id", orgId)
        .eq("organization_address", data.organization_address)
        .eq("service", data.service)
        .eq("address", data.address)
        .throwOnError();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.all(orgId),
      });
    },
  });
}
