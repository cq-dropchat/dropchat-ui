// Which organization the app opens on, for a member of more than one.
//
// The hook said "Select the most recent organization" and did not: it sorted
// with `+b.created_at - +a.created_at`, and `created_at` is an ISO string, so
// `+string` is NaN, every comparison was NaN and the sort was a no-op. What
// survived was the order the query happened to arrive in — `useOrganizations`
// asks PostgREST for `.order("name")` — and then it took `.at(-1)` of that.
//
// So the answer was neither the most recent nor random: it was the last
// organization alphabetically, stable and wrong, and nothing said so.
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useBoundStore from "@/stores/useBoundStore";
import { useSetActiveOrg } from "./useSetActiveOrg";

type Org = { id: string; name: string; created_at: string };

const query = vi.hoisted(() => ({ value: undefined as Org[] | undefined }));

vi.mock("@/queries/useOrganizations", () => ({
  useOrganizations: () => ({ data: query.value }),
}));

/** As PostgREST returns them: `.order("name")`, so alphabetical. */
const ALPHABETICAL: Org[] = [
  {
    id: "id-mountain",
    name: "Mountain Peaks",
    created_at: "2026-09-21T21:25:04.758422+00:00",
  },
  {
    id: "id-plains",
    name: "Plains",
    created_at: "2026-09-21T21:25:04.758422+00:00",
  },
];

const BY_AGE: Org[] = [
  { id: "id-old", name: "Alpha", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "id-new", name: "Zulu", created_at: "2026-09-21T00:00:00.000Z" },
];

function active() {
  return useBoundStore.getState().ui.activeOrgId;
}

describe("useSetActiveOrg", () => {
  beforeEach(() => {
    useBoundStore.getState().ui.setActiveOrg(null);
    query.value = undefined;
  });

  // The discriminating case: the newest organization must also NOT be the
  // last one the list hands over, or the test cannot tell "most recent" from
  // "whatever came last" — which is the bug.
  it("opens on the most recent even when it is first alphabetically", async () => {
    query.value = [
      { id: "id-new", name: "Alpha", created_at: "2026-09-21T00:00:00.000Z" },
      { id: "id-old", name: "Zulu", created_at: "2024-01-01T00:00:00.000Z" },
    ];
    renderHook(() => useSetActiveOrg());

    await waitFor(() => expect(active()).toBe("id-new"));
  });

  it("breaks a tie on created_at by name, so the answer never flips", async () => {
    // seed.sql creates both in one statement: same created_at to the
    // microsecond. Without a tie-break the result rides on argument order.
    query.value = ALPHABETICAL;
    renderHook(() => useSetActiveOrg());
    await waitFor(() => expect(active()).toBe("id-mountain"));

    useBoundStore.getState().ui.setActiveOrg(null);
    query.value = [...ALPHABETICAL].reverse();
    renderHook(() => useSetActiveOrg());
    await waitFor(() => expect(active()).toBe("id-mountain"));
  });

  it("does not reorder the array the query cache handed it", async () => {
    // `.sort()` sorts in place. The array belongs to TanStack Query, and every
    // other reader of that cache sees the same object.
    query.value = BY_AGE;
    const given = query.value;
    renderHook(() => useSetActiveOrg());

    await waitFor(() => expect(active()).toBe("id-new"));
    expect(given.map((o) => o.id)).toEqual(["id-old", "id-new"]);
  });

  it("keeps the organization already chosen when it still exists", async () => {
    useBoundStore.getState().ui.setActiveOrg("id-old");
    query.value = BY_AGE;
    renderHook(() => useSetActiveOrg());

    await waitFor(() => expect(active()).toBe("id-old"));
  });
});
