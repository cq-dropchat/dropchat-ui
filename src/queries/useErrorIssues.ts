// E1. The error panel's data. Unlike every other query in this folder these
// are not scoped to an organization: an error issue belongs to the product.
// RLS is what keeps them private — only a row in public.platform_admins gets
// a SELECT through, so for everyone else these queries come back empty rather
// than forbidden.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Database, supabase } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

export type ErrorIssue = Database["public"]["Tables"]["error_issues"]["Row"];
export type ErrorStatus = Database["public"]["Enums"]["error_status"];
export type ErrorSettings =
  Database["public"]["Tables"]["error_settings"]["Row"];

/** What the panel shows by default: everything nobody has settled yet. */
export const OPEN_STATUSES: ErrorStatus[] = ["new", "acknowledged"];

/**
 * Whether the signed-in user may see the panel at all. The policy on
 * platform_admins only returns your own row, so this is a membership test that
 * cannot also enumerate who else is one.
 */
export function useIsPlatformAdmin() {
  const userId = useBoundStore((state) => state.ui.user?.id);

  return useQuery({
    queryKey: queryKeys.errors.isPlatformAdmin(userId),
    queryFn: async () =>
      await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", userId!)
        .maybeSingle()
        .throwOnError(),
    enabled: !!userId,
    select: (data) => !!data.data,
  });
}

/**
 * `filter` is "open" (the default view), a single status, or "all".
 *
 * The default deliberately excludes `preexisting`: that status exists so the
 * panel can stay quiet about what was already broken when reporting was turned
 * on. It is one click away, never gone.
 */
export function useErrorIssues(filter: "open" | "all" | ErrorStatus = "open") {
  return useQuery({
    queryKey: queryKeys.errors.issues(filter),
    queryFn: async () => {
      const query = supabase
        .from("error_issues")
        .select()
        .order("last_seen", { ascending: false })
        .limit(200);

      if (filter === "open") query.in("status", OPEN_STATUSES);
      else if (filter !== "all") query.eq("status", filter);

      return await query.throwOnError();
    },
    select: (data) => data.data as ErrorIssue[],
  });
}

/**
 * The baseline switch. No row means nobody has closed it yet, which reads as
 * open — the same default the database applies, kept in step here so a fresh
 * install shows "learning" rather than a blank.
 */
export function useErrorSettings() {
  return useQuery({
    queryKey: queryKeys.errors.settings(),
    queryFn: async () =>
      await supabase
        .from("error_settings")
        .select()
        .maybeSingle()
        .throwOnError(),
    select: (data) =>
      (data.data as ErrorSettings | null) ?? {
        id: true,
        baseline_open: true,
        baseline_closed_at: null,
        baseline_closed_by: null,
        updated_at: new Date().toISOString(),
      },
  });
}

/**
 * Triage. The UPDATE grant covers `status` and `notes` and nothing else, so an
 * attempt to write anything more here would be refused by Postgres, not by a
 * check in this file.
 */
export function useTriageErrorIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status?: ErrorStatus;
      notes?: string | null;
    }) =>
      await supabase
        .from("error_issues")
        .update({
          ...(status ? { status } : {}),
          ...(notes !== undefined ? { notes } : {}),
        })
        .eq("id", id)
        .throwOnError(),
    // Every filtered list can change when one issue moves between statuses, so
    // the whole prefix goes rather than one key.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["error_issues"] }),
  });
}

/**
 * Closing the baseline is the moment the panel starts being about the present.
 * An RPC rather than an update, so the database records who did it and when.
 */
export function useCloseErrorBaseline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      await supabase.rpc("close_error_baseline").throwOnError(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.errors.settings(),
      });
      await queryClient.invalidateQueries({ queryKey: ["error_issues"] });
    },
  });
}
