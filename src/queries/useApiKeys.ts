import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiKeyInsert, type ApiKeyRow, supabase } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

export function useApiKeys() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.apiKeys.all(orgId),
    queryFn: async () =>
      await supabase
        .from("api_keys")
        .select()
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .throwOnError(),
    enabled: !!userId && !!orgId,
    select: (data) => data.data as ApiKeyRow[],
  });
}

export function useApiKey(id: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.apiKeys.detail(orgId, id),
    queryFn: async () =>
      await supabase
        .from("api_keys")
        .select()
        .eq("id", id)
        .eq("organization_id", orgId!)
        .single()
        .throwOnError(),
    enabled: !!userId && !!orgId,
    select: (data) => data.data as ApiKeyRow,
    experimental_prefetchInRender: true,
  });
}

/** What create_api_key hands back: the row id and the secret, ONCE. */
export type MintedApiKey = { id: string; key: string; key_prefix: string };

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (
      data: Pick<ApiKeyInsert, "name" | "role" | "expires_at">,
    ): Promise<MintedApiKey> => {
      if (!orgId) throw new Error("No active organization");

      // F14: the key is minted server-side and stored as sha256 + prefix;
      // this is the only time the plain secret exists outside the caller.
      const { data: minted } = await supabase
        .rpc("create_api_key", {
          p_organization_id: orgId,
          p_name: data.name,
          p_role: data.role ?? "member",
          p_expires_at: data.expires_at ?? undefined,
        })
        .single()
        .throwOnError();

      return minted;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all(orgId),
      });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("No active organization");

      await supabase.from("api_keys").delete().eq("id", id).throwOnError();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.all(orgId),
      });
    },
  });
}
