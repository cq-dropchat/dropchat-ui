// Bounded local diagnostics; no IDs, content, URLs or synchronous collector.
export type ClientStage =
  | "client.initial"
  | "client.history"
  | "client.recovery"
  | "client.visible";
export type ClientSample = {
  ts: string;
  event: ClientStage;
  outcome: "success" | "failure";
  duration_ms: number;
  release: string;
};
const samples: ClientSample[] = [];
let dropped = 0;
export function observeClient(
  event: ClientStage,
  outcome: ClientSample["outcome"],
  duration_ms: number,
): void {
  try {
    if (!Number.isFinite(duration_ms) || duration_ms < 0) return;
    if (samples.length === 2000) {
      samples.shift();
      dropped++;
    }
    samples.push({
      ts: new Date().toISOString(),
      event,
      outcome,
      duration_ms,
      release: import.meta.env.VITE_RELEASE || "unknown",
    });
  } catch {
    /* Diagnostics never break the reader's flow. */
  }
}
export function clientDiagnostics() {
  const resources = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  return {
    observed_at: new Date().toISOString(),
    samples: [...samples],
    dropped,
    resource_samples: resources.length,
    transferred_bytes: resources.reduce(
      (total, r) => total + r.transferSize,
      0,
    ),
    clock_note: "local durations; no cross-clock delivery latency",
    complete_business_window: false,
  };
}
export function downloadClientDiagnostics() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(clientDiagnostics(), null, 2)], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "dropchat-client-diagnostics.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
