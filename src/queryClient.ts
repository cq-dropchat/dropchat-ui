import { QueryClient } from "@tanstack/react-query";

/**
 * F10. The app's QueryClient. Without defaults every query was stale at once
 * and refetched on every window focus — with one contact query per
 * conversation in the list, focusing the tab sent thousands of requests.
 * Live data does not come through these queries anyway: messages and
 * conversations arrive over Realtime into the store.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
