import { useOrganizations } from "@/queries/useOrganizations";
import useBoundStore from "@/stores/useBoundStore";
import { useEffect } from "react";

export const useSetActiveOrg = () => {
  const setActiveOrg = useBoundStore((state) => state.ui.setActiveOrg);
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const { data } = useOrganizations();

  // The most recent organization, when none is selected or the current one is
  // stale.
  //
  // This used to sort with `+b.created_at - +a.created_at`. `created_at` is an
  // ISO string, so `+created_at` is NaN, every comparison was NaN and the sort
  // did nothing — and then `.at(-1)` took the last of the untouched list,
  // which `useOrganizations` asks PostgREST to `.order("name")`. The answer
  // was the last organization alphabetically: not what the line said, not
  // random either, so nobody had a reason to look.
  //
  // `Date.parse` because it is the string that has to be read as a date, and
  // the tie-break because it is not hypothetical: seed.sql creates two
  // organizations in one statement with the same created_at to the
  // microsecond, and without it the winner rides on the order the rows
  // happened to arrive in. Copied before sorting: the array belongs to the
  // query cache, and `.sort()` reorders in place for every other reader.
  useEffect(() => {
    if (!data) return;

    // Keep the current org if it still exists
    if (activeOrgId && data.some((o) => o.id === activeOrgId)) return;

    const [mostRecent] = [...data].sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        a.name.localeCompare(b.name),
    );

    setActiveOrg(mostRecent?.id ?? null);
  }, [data]);
};
