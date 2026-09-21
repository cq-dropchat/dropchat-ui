import { describe, expect, it } from "vitest";
import { centerPanel } from "./centerPanel";

// What fills the center column of the app, decided from the path and the open
// conversation. It lived inline in `_auth.tsx` as a pair of `startsWith`
// checks, which is fine until a third screen wants the center — and then the
// one case nobody checks is the path that merely looks like it.
describe("the center panel", () => {
  it("is the chat when a conversation is open", () => {
    expect(centerPanel("/conversations", "conv-1")).toBe("chat");
  });

  it("is stats on the stats screens", () => {
    expect(centerPanel("/stats", null)).toBe("stats");
    expect(centerPanel("/stats/usage", null)).toBe("stats");
  });

  it("is the template panel on its own screens", () => {
    expect(centerPanel("/templates", null)).toBe("templates");
    expect(centerPanel("/templates/new", null)).toBe("templates");
    expect(centerPanel("/templates/11111111-2222", null)).toBe("templates");
  });

  // The trap. WhatsApp message templates are a different thing entirely, and
  // they live under a path that ends the same way.
  it("is not the template panel for WhatsApp message templates", () => {
    expect(
      centerPanel("/integrations/whatsapp/56911110000/templates", null),
    ).toBe("actions");
    expect(
      centerPanel("/integrations/whatsapp/56911110000/templates/new", null),
    ).toBe("actions");
  });

  it("falls back to the action cards, which is the empty state", () => {
    expect(centerPanel("/agents", null)).toBe("actions");
    expect(centerPanel("/", null)).toBe("actions");
  });

  // An open conversation wins: opening one from any screen shows it, which is
  // how the app has always behaved.
  it("shows an open conversation over a screen that wants the center", () => {
    expect(centerPanel("/agents", "conv-1")).toBe("chat");
    // Except where the screen IS the center: stats and templates have no
    // conversation to show next to them.
    expect(centerPanel("/stats", "conv-1")).toBe("stats");
    expect(centerPanel("/templates", "conv-1")).toBe("templates");
  });
});
