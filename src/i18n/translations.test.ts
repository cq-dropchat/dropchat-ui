// F22: main.tsx awaits the locale JSON before mounting React, and the fetch
// only started after the whole entry bundle had downloaded and run — a
// waterfall on every non-Spanish first load. index.html now starts the
// request inline, in parallel with the scripts; loadTranslations reuses it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EarlyLocale = { lang: string; response: Promise<Response> };

function jsonResponse(body: Record<string, string>) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("loadTranslations", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __earlyLocale?: EarlyLocale }).__earlyLocale;
  });

  it("reuses the request index.html started for the same language", async () => {
    (globalThis as { __earlyLocale?: EarlyLocale }).__earlyLocale = {
      lang: "pt",
      response: jsonResponse({ Hola: "Olá" }),
    };
    const { loadTranslations, getTranslation } = await import("./translations");

    await loadTranslations("pt");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTranslation("Hola", "pt")).toBe("Olá");
  });

  it("fetches normally when the early request was for another language", async () => {
    (globalThis as { __earlyLocale?: EarlyLocale }).__earlyLocale = {
      lang: "pt",
      response: jsonResponse({ Hola: "Olá" }),
    };
    fetchMock.mockReturnValue(jsonResponse({ Hola: "Hello" }));
    const { loadTranslations, getTranslation } = await import("./translations");

    await loadTranslations("en");

    expect(fetchMock).toHaveBeenCalledWith("/locales/en.json");
    expect(getTranslation("Hola", "en")).toBe("Hello");
  });

  it("falls back to a fetch when the early request failed", async () => {
    (globalThis as { __earlyLocale?: EarlyLocale }).__earlyLocale = {
      lang: "fr",
      response: Promise.reject(new TypeError("network")),
    };
    fetchMock.mockReturnValue(jsonResponse({ Hola: "Bonjour" }));
    const { loadTranslations, getTranslation } = await import("./translations");

    await loadTranslations("fr");

    expect(fetchMock).toHaveBeenCalledWith("/locales/fr.json");
    expect(getTranslation("Hola", "fr")).toBe("Bonjour");
  });

  it("concurrent loads of one language share a single request", async () => {
    // main.tsx and the store's rehydration both load the language at start.
    fetchMock.mockImplementation(() => jsonResponse({ Hola: "Hello" }));
    const { loadTranslations, getTranslation } = await import("./translations");

    await Promise.all([loadTranslations("en"), loadTranslations("en")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getTranslation("Hola", "en")).toBe("Hello");
  });

  it("downloads nothing for Spanish", async () => {
    const { loadTranslations } = await import("./translations");
    await loadTranslations("es");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
