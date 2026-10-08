import { useEffect, useMemo, useRef, useState } from "react";
import {
  createConversationSearch,
  type SearchableConversation,
} from "@/workers/conversationSearch";

/** Small lists are cheap; large indexes and queries live entirely in the worker. */
export function useConversationSearch(
  items: SearchableConversation[],
  pattern: string,
) {
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [result, setResult] = useState<{
    items: SearchableConversation[];
    pattern: string;
    ids: { id: string; score: number }[];
  } | null>(null);
  const large = items.length >= 1000;
  const hasSearch = !!pattern;
  const search = useMemo(
    () => (large ? null : createConversationSearch(items)),
    [items, large],
  );
  useEffect(() => {
    if (!large || !hasSearch) return;
    const instance = new Worker(
      new URL("../workers/conversationSearch.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    instance.postMessage({ items, requestId: ++requestId.current });
    return () => {
      worker.current = null;
      requestId.current++;
      instance.terminate();
    };
  }, [items, large, hasSearch]);
  useEffect(() => {
    if (!large || !pattern || !worker.current) return;
    const instance = worker.current;
    const id = ++requestId.current;
    instance.onmessage = ({
      data,
    }: MessageEvent<{
      requestId: number;
      ids: { id: string; score: number }[];
    }>) => {
      if (data.requestId === requestId.current)
        setResult({ items, pattern, ids: data.ids });
    };
    const timer = setTimeout(
      () => instance.postMessage({ pattern, requestId: id }),
      150,
    );
    return () => {
      clearTimeout(timer);
      requestId.current++;
    };
  }, [items, pattern, large]);
  return useMemo(
    () =>
      !pattern
        ? null
        : search
          ? search(pattern)
          : result?.items === items && result.pattern === pattern
            ? result.ids
            : undefined,
    [items, pattern, search, result],
  );
}
