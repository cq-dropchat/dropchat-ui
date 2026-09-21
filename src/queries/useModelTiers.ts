import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/supabase/client";
import { queryKeys } from "./queryKeys";

/**
 * T2 — the levels an agent can run on.
 *
 * A global catalogue, readable by anybody: the rows are the same for every
 * organization and only a platform admin writes them. That is the whole
 * indirection — an agent stores a slug, so retiring a model is one UPDATE here
 * instead of one write per agent in every organization that installed it.
 *
 * Ordered by `sort_order` and not by name, because alphabetical would put
 * «Avanzado» first and the cheapest option is the one most shops want.
 */
export function useModelTiers() {
  return useQuery({
    queryKey: queryKeys.modelTiers.all(),
    queryFn: async () =>
      await supabase
        .from("model_tiers")
        .select()
        .order("sort_order")
        .throwOnError(),
    // They change when a provider retires a model, which is not something that
    // happens while somebody is filling in a form.
    staleTime: 60 * 60 * 1000,
    select: (data) => data.data,
  });
}
