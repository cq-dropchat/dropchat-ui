import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/types/database_types";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

export type OrganizationExportRow =
  Database["public"]["Tables"]["organization_exports"]["Row"];

/** pending → processing → ready | failed, and `expired` once the file is gone. */
export type ExportStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "expired";

export const isExportInProgress = (status?: string) =>
  status === "pending" || status === "processing";

/**
 * The organization's newest export (F18). Owners only: the table's policy
 * hands nothing to anyone else, so a member's query would come back empty
 * rather than wrong — the screen still asks the role before showing anything.
 */
export function useOrganizationExport() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.organizations.exports(orgId),
    queryFn: async () =>
      await supabase
        .from("organization_exports")
        .select()
        .eq("organization_id", orgId!)
        .order("requested_at", { ascending: false })
        .limit(1)
        .throwOnError(),
    enabled: !!orgId,
    select: (data) => (data.data?.[0] ?? null) as OrganizationExportRow | null,
    // The worker is a cron job, so the row changes without telling anyone.
    // Poll while it is working and stop as soon as it is not.
    refetchInterval: (query) =>
      isExportInProgress(query.state.data?.data?.[0]?.status) ? 5000 : false,
  });
}

/**
 * Files an export. While one is pending or processing the RPC returns that
 * one, so pressing the button twice cannot queue two.
 */
export function useRequestOrganizationExport() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No active organization");

      const { data } = await supabase
        .rpc("request_organization_export", { _organization_id: orgId })
        .throwOnError();

      return data as string;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.exports(orgId),
      }),
  });
}

/**
 * Signs a one-hour URL for a ready export. The bucket is private and the
 * object path carries the organization, which is what its policy checks.
 */
export function useSignOrganizationExport() {
  return useMutation({
    mutationFn: async (objectName: string) => {
      const { data, error } = await supabase.storage
        .from("exports")
        .createSignedUrl(objectName, 3600);

      if (error) throw error;

      return data.signedUrl;
    },
  });
}
