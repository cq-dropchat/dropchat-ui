import { describe, it, expect } from "vitest";
import {
  onRecoverySignal,
  subscriptionObserver,
  type RecoverySignal,
} from "./recoverySignals";
describe("scoped subscription recovery", () => {
  it("does not recover on initial subscription and reports a real reconnect once", () => {
    const events: RecoverySignal[] = [];
    const off = onRecoverySignal((event) => events.push(event));
    try {
      const observe = subscriptionObserver("tenant-a", "user-a");
      observe("SUBSCRIBED");
      observe("SUBSCRIBED");
      expect(events).toEqual([]);
      observe("CHANNEL_ERROR");
      observe("SUBSCRIBED");
      observe("SUBSCRIBED");
      expect(events.map((e) => e.state)).toEqual([
        "disconnected",
        "reconnected",
      ]);
      expect(
        events.every(
          (e) => e.organizationId === "tenant-a" && e.userId === "user-a",
        ),
      ).toBe(true);
    } finally {
      off();
    }
  });
});
