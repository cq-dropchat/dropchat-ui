import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConversationSearch } from "./useConversationSearch";
type WorkerRequest = {
  requestId: number;
  items?: { id: string; name: string | null; address: string }[];
  pattern?: string;
};
type WorkerReply = { requestId: number; ids: { id: string; score: number }[] };
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;
  postMessage = vi.fn<(data: WorkerRequest) => void>();
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
  reply(requestId: number, id: string) {
    this.onmessage?.({
      data: { requestId, ids: [{ id, score: 0 }] },
    } as MessageEvent<WorkerReply>);
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  TestWorker.instances = [];
});
describe("conversation search", () => {
  it("indexes once, debounces input and ignores obsolete worker results", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", TestWorker);
    const items = Array.from({ length: 50000 }, (_, i) => ({
      id: String(i),
      name: `Contact ${i}`,
      address: String(i),
    }));
    const { result, rerender, unmount } = renderHook(
      ({ pattern }) => useConversationSearch(items, pattern),
      { initialProps: { pattern: "Contact 4" } },
    );
    const worker = TestWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(150));
    const first = worker.postMessage.mock.calls.at(-1)![0].requestId;
    rerender({ pattern: "Contact 42" });
    await act(() => vi.advanceTimersByTimeAsync(150));
    const last = worker.postMessage.mock.calls.at(-1)![0].requestId;
    act(() => worker.reply(first, "4"));
    expect(result.current).toBeUndefined();
    act(() => worker.reply(last, "42"));
    expect(result.current).toEqual([{ id: "42", score: 0 }]);
    expect(TestWorker.instances).toHaveLength(1);
    expect(
      worker.postMessage.mock.calls.filter(([data]) => data.items),
    ).toHaveLength(1);
    unmount();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("does not start a worker until a large list is searched", () => {
    vi.stubGlobal("Worker", TestWorker);
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      name: null,
      address: String(i),
    }));
    renderHook(() => useConversationSearch(items, ""));
    expect(TestWorker.instances).toHaveLength(0);
  });
});
