import { describe, expect, it } from "vitest";
import { isModelProvider, PROVIDERS } from "./types/model_providers";

// T2 — what replaced this screen's own copy of the provider table.
//
// This file used to be `routes/_auth/agents/models.test.ts`, and it pinned
// three maps that lived in the agent form: `defaultModels`, `creditModels` and
// `protocols`. They were the UI's third copy of a relation the two protocol
// handlers each had their own version of.
//
// Two of those are gone for good reasons that are worth keeping straight:
//
//   - WHICH model each level uses is now `public.model_tiers`, a table, so a
//     provider retiring a model is one UPDATE and not a deploy. The gate that
//     used to live here — "everything offered has a price, or the call throws
//     `No pricing found`" — is now pgTAP `38_model_tiers`, which can check it
//     against `billing.costs` instead of against another list in this repo.
//   - HOW each provider is reached is this module, mirrored from the API
//     (`_shared/types/model_providers.ts`), so the form cannot offer something
//     the API cannot call.
//
// What is left here is what a mirror can check: that the map is shaped the way
// both sides read it.
describe("T2: the providers the API can reach", () => {
  it("gives every provider at least one protocol", () => {
    // An empty list would render a level nothing can run on.
    for (const config of Object.values(PROVIDERS)) {
      expect(config.protocols.length).toBeGreaterThan(0);
    }
  });

  it("names a default model for each", () => {
    for (const config of Object.values(PROVIDERS)) {
      expect(config.default_model).toBeTruthy();
    }
  });

  it("leaves OpenAI without a base URL, which is how it is reached", () => {
    // Not an omission: the client uses its own default base URL and reads
    // OPENAI_API_KEY by itself. Giving it one here changes where every call
    // with no explicit provider goes.
    expect(PROVIDERS.openai.base_url).toBeUndefined();
    expect(PROVIDERS.openai.api_key_env).toBeUndefined();
  });

  it("tells every other provider which variable holds its key", () => {
    for (const [name, config] of Object.entries(PROVIDERS)) {
      if (name === "openai") continue;
      expect(config.base_url).toMatch(/^https:\/\//);
      // The NAME of the variable, never a key.
      expect(config.api_key_env).toMatch(/^[A-Z0-9_]+_API_KEY$/);
    }
  });

  it("recognizes its own providers and nothing else", () => {
    expect(isModelProvider("groq")).toBe(true);
    expect(isModelProvider("custom")).toBe(false);
    expect(isModelProvider("constructor")).toBe(false);
  });
});
