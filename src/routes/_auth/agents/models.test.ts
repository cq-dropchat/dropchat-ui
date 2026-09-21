import { describe, expect, it } from "vitest";
import { creditModels, defaultModels, protocols } from "./new";

// An agent created with the defaults and no API key of its own runs on
// platform credits, and a credits call is refused outright when the API has
// no price for its `provider/model` pair — `No pricing found for
// groq/openai/gpt-oss-20b`, which is how production was found to be missing
// its whole billing reference table.
//
// What these cases can and cannot do: they pin that the lists here agree with
// each other. They CANNOT tell whether a model id exists at the provider, or
// whether the API prices it — neither fact is reachable from this repo. The
// list of credit-covered models is pinned against the price rows in the API's
// pgTAP `33_billing_reference_data`, which is the gate that catches a model
// offered here and unpriced there.
describe("the models the agent form offers", () => {
  it("covers every provider's default with credits", () => {
    // Otherwise "create an agent, press save" produces one that cannot answer
    // until somebody pastes an API key.
    for (const [provider, model] of Object.entries(defaultModels)) {
      expect(creditModels[provider]).toContain(model);
    }
  });

  it("names a provider the protocol table knows", () => {
    for (const provider of Object.keys(creditModels)) {
      expect(protocols[provider]).toBeDefined();
      expect(protocols[provider].length).toBeGreaterThan(0);
    }
  });

  it("offers no empty list, which would render an empty picker", () => {
    for (const models of Object.values(creditModels)) {
      expect(models.length).toBeGreaterThan(0);
    }
  });

  it("repeats no model inside a provider", () => {
    for (const models of Object.values(creditModels)) {
      expect(new Set(models).size).toBe(models.length);
    }
  });
});
