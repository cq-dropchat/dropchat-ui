import { describe, it, expect, vi } from "vitest";
import { observeClient, clientDiagnostics } from "./telemetry";
describe("bounded client diagnostics", () => {
  it("caps retained samples and records the missing denominator without identifiers", () => {
    for (let n = 0; n < 2010; n++)
      observeClient("client.history", "success", n);
    const result = clientDiagnostics();
    expect(result.samples).toHaveLength(2000);
    expect(result.dropped).toBe(10);
    expect(result.complete_business_window).toBe(false);
    expect(Object.keys(result.samples[0]).sort()).toEqual(
      ["ts", "event", "outcome", "duration_ms", "release"].sort(),
    );
    observeClient("client.history", "failure", NaN);
    expect(clientDiagnostics().samples).toHaveLength(2000);
  });
  it("a broken local observer cannot interrupt the user's flow", () => {
    const clock = vi
      .spyOn(Date.prototype, "toISOString")
      .mockImplementationOnce(() => {
        throw new Error("collector unavailable");
      });
    expect(() => observeClient("client.recovery", "failure", 12)).not.toThrow();
    clock.mockRestore();
  });
});
