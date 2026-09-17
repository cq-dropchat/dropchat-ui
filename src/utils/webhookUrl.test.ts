import { describe, expect, it } from "vitest";
import { isPublicHttpsUrl } from "./webhookUrl";

// Same cases as supabase/tests/database/07_webhook_deliveries (API repo).
describe("F06: isPublicHttpsUrl", () => {
  it.each([
    "https://hooks.example.test/messages",
    "https://api.example.com:8443/v1/hook?x=1",
  ])("accepts %s", (url) => {
    expect(isPublicHttpsUrl(url)).toBe(true);
  });

  it.each([
    "http://hooks.example.test/messages",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.5/hook",
    "https://127.0.0.1:9/hook",
    "https://localhost/hook",
    "https://db.supabase.internal/hook",
    "https://kong.local/hook",
    "https://user:pass@hooks.example.test/hook",
    "https://[::1]/hook",
    "ftp://hooks.example.test/x",
  ])("refuses %s", (url) => {
    expect(isPublicHttpsUrl(url)).toBe(false);
  });
});
